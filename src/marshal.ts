import type { WasmBinary } from "./dsl/types";
import { instantiate } from "./test-helpers";

// --- i32 arrays ---

/** Writes a JS number array as i32 values into a Wasm Int32Array view. */
export function writeI32Array(mem: Int32Array, wordOffset: number, data: number[]): void {
  for (let i = 0; i < data.length; i++) {
    mem[wordOffset + i] = data[i]!;
  }
}

/** Reads i32 values from a Wasm Int32Array view into a JS number array. */
export function readI32Array(mem: Int32Array, wordOffset: number, len: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < len; i++) {
    result.push(mem[wordOffset + i]!);
  }
  return result;
}

// --- f64 arrays ---

/** Writes a JS number array as f64 values into Wasm memory. */
export function writeF64Array(bytes: Uint8Array, byteOffset: number, data: number[]): void {
  const view = new Float64Array(bytes.buffer, byteOffset, data.length);
  for (let i = 0; i < data.length; i++) {
    view[i] = data[i]!;
  }
}

/** Reads f64 values from Wasm memory into a JS number array. */
export function readF64Array(bytes: Uint8Array, byteOffset: number, len: number): number[] {
  const view = new Float64Array(bytes.buffer, byteOffset, len);
  return Array.from(view);
}

// --- Strings ---

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Writes a UTF-8 string into Wasm memory. Returns the number of bytes written. */
export function writeString(bytes: Uint8Array, offset: number, str: string): number {
  const encoded = encoder.encode(str);
  bytes.set(encoded, offset);
  return encoded.length;
}

/** Reads a UTF-8 string from Wasm memory. Stops at null terminator or maxLen. */
export function readString(bytes: Uint8Array, offset: number, maxLen?: number): string {
  let end = offset;
  const limit = maxLen != null ? offset + maxLen : bytes.length;
  while (end < limit && bytes[end] !== 0) {
    end++;
  }
  return decoder.decode(bytes.subarray(offset, end));
}

// --- Roundtrip helper ---

interface LayoutEntry {
  type: "i32" | "f64";
  offset: number;
  count: number;
}

/**
 * Convenience helper for the common pattern:
 * 1. Write input data to Wasm memory
 * 2. Call an exported function
 * 3. Read output data from Wasm memory
 */
export async function roundtrip<R>(
  binary: WasmBinary<any>,
  layout: Record<string, LayoutEntry>,
  inputs: Record<string, number[]>,
  run: (exports: any) => R,
): Promise<{ result: R; outputs: Record<string, number[]> }> {
  const { exports, mem, bytes } = await instantiate(binary);

  // Write inputs
  for (const [name, data] of Object.entries(inputs)) {
    const entry = layout[name];
    if (!entry) continue;
    if (entry.type === "i32" && mem) {
      writeI32Array(mem, entry.offset / 4, data);
    } else if (entry.type === "f64" && bytes) {
      writeF64Array(bytes, entry.offset, data);
    }
  }

  // Run
  const result = run(exports);

  // Read outputs
  const outputs: Record<string, number[]> = {};
  for (const [name, entry] of Object.entries(layout)) {
    if (entry.type === "i32" && mem) {
      outputs[name] = readI32Array(mem, entry.offset / 4, entry.count);
    } else if (entry.type === "f64" && bytes) {
      outputs[name] = readF64Array(bytes, entry.offset, entry.count);
    }
  }

  return { result, outputs };
}
