/**
 * Convenience wrapper around `WebAssembly.instantiate` for tests and benchmarks.
 *
 * Centralizes the `as any` cast and provides typed access to exports and memory views.
 * When the input is a {@link WasmBinary WasmBinary<T>}, the `exports` field is
 * automatically typed as `T & { memory?: WebAssembly.Memory }`.
 */
export async function instantiate<T = Record<string, unknown>>(
  binary: Uint8Array & { readonly __exports?: T },
  imports?: WebAssembly.Imports,
): Promise<{
  exports: T & { memory?: WebAssembly.Memory };
  mem: Int32Array | null;
  bytes: Uint8Array | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await WebAssembly.instantiate(binary, imports);
  const exp = result.instance.exports;
  const memory = exp.memory as WebAssembly.Memory | undefined;
  return {
    exports: exp,
    mem: memory ? new Int32Array(memory.buffer) : null,
    bytes: memory ? new Uint8Array(memory.buffer) : null,
  };
}
