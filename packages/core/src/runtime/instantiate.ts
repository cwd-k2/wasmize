/** Shared return type for all instantiation helpers. */
export type InstantiateResult<T> = {
  exports: T & { memory?: WebAssembly.Memory };
  mem: Int32Array | null;
  bytes: Uint8Array | null;
};

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
  refreshViews(): void;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await WebAssembly.instantiate(binary, imports);
  const exp = result.instance.exports;
  const memory = exp.memory as WebAssembly.Memory | undefined;
  const out = {
    exports: exp,
    mem: memory ? new Int32Array(memory.buffer) : null,
    bytes: memory ? new Uint8Array(memory.buffer) : null,
    refreshViews() {
      if (memory) {
        out.mem = new Int32Array(memory.buffer);
        out.bytes = new Uint8Array(memory.buffer);
      }
    },
  };
  return out;
}

/**
 * Instantiates a Wasm module from a URL using streaming compilation.
 *
 * Uses `fetch` + `WebAssembly.instantiateStreaming` for optimal performance:
 * the browser can compile the module while bytes are still arriving.
 *
 * @param url - URL to fetch the Wasm binary from
 * @param imports - Optional WebAssembly imports
 */
export async function instantiateFromUrl<T = Record<string, unknown>>(
  url: string,
  imports?: WebAssembly.Imports,
): Promise<{
  exports: T & { memory?: WebAssembly.Memory };
  mem: Int32Array | null;
  bytes: Uint8Array | null;
}> {
  const response = fetch(url);
  return instantiateFromResponse<T>(await response, imports);
}

/**
 * Instantiates a Wasm module from a `Response` object using streaming compilation.
 *
 * Useful when you already have a `Response` (e.g., from a service worker or cache).
 *
 * @param response - Response containing the Wasm binary
 * @param imports - Optional WebAssembly imports
 */
export async function instantiateFromResponse<T = Record<string, unknown>>(
  response: Response,
  imports?: WebAssembly.Imports,
): Promise<{
  exports: T & { memory?: WebAssembly.Memory };
  mem: Int32Array | null;
  bytes: Uint8Array | null;
}> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await WebAssembly.instantiateStreaming(response, imports);
  const exp = result.instance.exports;
  const memory = exp.memory as WebAssembly.Memory | undefined;
  return {
    exports: exp,
    mem: memory ? new Int32Array(memory.buffer) : null,
    bytes: memory ? new Uint8Array(memory.buffer) : null,
  };
}
