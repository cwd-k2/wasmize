import type { WasmBinary } from "../dsl/types";

/**
 * AsyncBridge enables async JS ↔ sync Wasm interop via the effect protocol.
 *
 * **Protocol:**
 * - `mem[0]`: effect tag (set by Wasm)
 * - `mem[4]`: effect payload (set by Wasm)
 * - `mem[8]`: handler response (set by JS)
 * - `mem[12]`: phase counter (managed by bridge)
 *
 * The Wasm function should:
 * 1. Read `mem[12]` to check current phase
 * 2. Skip already-handled effects based on phase
 * 3. Emit next effect via `Ctrl.effect(tag, payload)` (returns -1)
 * 4. On re-invocation, read response from `mem[8]`
 *
 * @example
 * ```ts
 * const bridge = new AsyncBridge(binary);
 * bridge.on(1, async (payload) => payload * 2);
 * const result = await bridge.run("compute", 21);
 * ```
 */
export class AsyncBridge<T = Record<string, unknown>> {
  private handlers = new Map<number, (payload: number) => Promise<number>>();
  private binary: WasmBinary<T>;
  private imports: WebAssembly.Imports;

  constructor(binary: WasmBinary<T>, imports?: WebAssembly.Imports) {
    this.binary = binary;
    this.imports = imports ?? {};
  }

  /** Registers an async handler for the given effect tag. */
  on(tag: number, handler: (payload: number) => Promise<number>): this {
    this.handlers.set(tag, handler);
    return this;
  }

  /**
   * Runs a Wasm export, processing effect requests until completion.
   * Manages phase counter at `mem[12]` for re-invocation state tracking.
   */
  async run<K extends string & keyof T>(
    exportName: K,
    ...args: T[K] extends (...a: infer A) => any ? A : never[]
  ): Promise<T[K] extends (...a: any[]) => infer R ? R : unknown> {
    const { instance } = await WebAssembly.instantiate(this.binary, this.imports);
    const fn = instance.exports[exportName] as Function;
    const memory = instance.exports.memory as WebAssembly.Memory;

    // Reset phase counter
    const view = new Int32Array(memory.buffer);
    view[3] = 0; // mem[12] = phase 0

    let result = fn(...args);

    while (result === -1) {
      const tag = view[0]!;
      const payload = view[1]!;

      const handler = this.handlers.get(tag);
      if (!handler) {
        throw new Error(`No handler registered for effect tag ${tag}`);
      }

      const response = await handler(payload);
      // Write response to mem[8], advance phase at mem[12]
      view[2] = response;
      view[3]++;

      result = fn(...args);
    }

    return result;
  }
}
