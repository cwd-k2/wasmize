import { compile } from "./dsl/compiler";
import { Mod } from "./dsl/primitives";
import { BumpAllocator } from "./dsl/allocator";
import type { WasmRef, FuncInstruction, FuncReturn } from "./dsl/types";
import type { WasmValType } from "./wasm/opcodes";
import { instantiate } from "./test-helpers";

// --- Types ---

interface LayoutEntry {
  type: "i32" | "i64" | "f64";
  count: number;
}

interface FuncSpec {
  params: Record<string, WasmValType>;
  body: (...args: WasmRef[]) => Generator<FuncInstruction, FuncReturn, any>;
}

interface ModuleSpec {
  memory?: { pages?: number };
  layout?: Record<string, LayoutEntry>;
  functions: Record<string, FuncSpec>;
}

type LayoutViewType<T extends LayoutEntry> =
  T["type"] extends "i32" ? Int32Array :
  T["type"] extends "i64" ? BigInt64Array :
  T["type"] extends "f64" ? Float64Array :
  Int32Array | BigInt64Array | Float64Array;

interface WasmModule<S extends ModuleSpec> {
  exports: { [K in keyof S["functions"]]: Function };
  layout: S["layout"] extends Record<string, LayoutEntry>
    ? { [K in keyof S["layout"]]: S["layout"][K] extends LayoutEntry ? LayoutViewType<S["layout"][K]> : never }
    : Record<string, never>;
  instance: WebAssembly.Instance;
}

// --- Implementation ---

/**
 * Declarative module builder: define memory layout + functions in one spec.
 *
 * @example
 * ```ts
 * const mod = await wasmize({
 *   layout: { arr: { type: "i32", count: 100 } },
 *   functions: {
 *     sum: {
 *       params: { n: "i32" },
 *       body: function* (n) { ... },
 *     },
 *   },
 * });
 * mod.layout.arr.set([1, 2, 3]);
 * mod.exports.sum(3);
 * ```
 */
export async function wasmize<S extends ModuleSpec>(spec: S): Promise<WasmModule<S>> {
  const alloc = new BumpAllocator();

  // Process layout
  const layoutMeta: Record<string, { base: number; type: string; count: number }> = {};
  if (spec.layout) {
    for (const [name, entry] of Object.entries(spec.layout)) {
      const elemSize = entry.type === "i32" ? 4 : 8;
      const align = elemSize;
      const base = alloc.alloc(entry.count * elemSize, align);
      layoutMeta[name] = { base, type: entry.type, count: entry.count };
    }
  }

  // Build the module
  const funcNames = Object.keys(spec.functions);

  const binary = compile(function* () {
    const pages = spec.memory?.pages ?? Math.max(alloc.requiredPages, 1);
    yield* Mod.memory(pages);

    for (const name of funcNames) {
      const funcSpec = spec.functions[name]!;

      yield* Mod.exportFunc(
        name,
        funcSpec.params,
        funcSpec.body,
      );
    }
  });

  const { exports: rawExports } = await instantiate(binary);
  const memory = (rawExports as any).memory as WebAssembly.Memory;

  // Build typed layout views
  const layoutViews: Record<string, Int32Array | BigInt64Array | Float64Array> = {};
  if (spec.layout) {
    for (const [name, meta] of Object.entries(layoutMeta)) {
      const buffer = memory.buffer;
      switch (meta.type) {
        case "i32":
          layoutViews[name] = new Int32Array(buffer, meta.base, meta.count);
          break;
        case "i64":
          layoutViews[name] = new BigInt64Array(buffer, meta.base, meta.count);
          break;
        case "f64":
          layoutViews[name] = new Float64Array(buffer, meta.base, meta.count);
          break;
      }
    }
  }

  // Build exports record
  const exports: Record<string, Function> = {};
  for (const name of funcNames) {
    exports[name] = (rawExports as any)[name];
  }

  return {
    exports: exports as any,
    layout: layoutViews as any,
    instance: { exports: rawExports } as any,
  };
}
