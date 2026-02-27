/**
 * Memory dump and state snapshot utilities for Wasm debugging.
 *
 * {@link dumpMemory} produces a hex + ASCII formatted memory dump.
 * {@link snapshotMemory} copies a memory region into a new Uint8Array.
 * {@link diffMemory} compares two snapshots and reports differences.
 *
 * @module
 */

type WasmExports = Record<string, unknown> & { memory?: WebAssembly.Memory };

/**
 * Returns the Uint8Array view of a Wasm instance's exported memory.
 */
function getMemoryBytes(instance: { exports: WasmExports }): Uint8Array {
  const memory = instance.exports.memory;
  if (!memory) {
    throw new Error("Instance has no exported memory");
  }
  return new Uint8Array(memory.buffer);
}

/**
 * Produces a hex + ASCII formatted dump of Wasm memory.
 *
 * Format per line: `OFFSET  HH HH HH ... HH  |ASCII...|`
 * Non-printable bytes are shown as `.` in the ASCII column.
 *
 * @param instance - Wasm instance with exported memory
 * @param offset - Starting byte offset
 * @param length - Number of bytes to dump
 * @returns Formatted hex dump string
 */
export function dumpMemory(
  instance: { exports: WasmExports },
  offset: number,
  length: number,
): string {
  const bytes = getMemoryBytes(instance);
  const lines: string[] = [];
  const bytesPerLine = 16;

  for (let i = 0; i < length; i += bytesPerLine) {
    const lineOffset = offset + i;
    const lineLen = Math.min(bytesPerLine, length - i);

    // Hex part
    const hexParts: string[] = [];
    for (let j = 0; j < bytesPerLine; j++) {
      if (j < lineLen) {
        hexParts.push(bytes[lineOffset + j]!.toString(16).padStart(2, "0"));
      } else {
        hexParts.push("  ");
      }
    }

    // ASCII part
    let ascii = "";
    for (let j = 0; j < lineLen; j++) {
      const b = bytes[lineOffset + j]!;
      ascii += b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : ".";
    }

    const offsetStr = lineOffset.toString(16).padStart(8, "0");
    lines.push(`${offsetStr}  ${hexParts.join(" ")}  |${ascii}|`);
  }

  return lines.join("\n");
}

/**
 * Copies a region of Wasm memory into a new Uint8Array (snapshot).
 *
 * @param instance - Wasm instance with exported memory
 * @param offset - Starting byte offset
 * @param length - Number of bytes to copy
 * @returns A new Uint8Array containing the copied bytes
 */
export function snapshotMemory(
  instance: { exports: WasmExports },
  offset: number,
  length: number,
): Uint8Array {
  const bytes = getMemoryBytes(instance);
  return bytes.slice(offset, offset + length);
}

/** A single byte difference between two snapshots. */
export interface MemoryDiff {
  offset: number;
  a: number;
  b: number;
}

/**
 * Compares two memory snapshots and returns differences.
 *
 * Both snapshots must have the same length.
 *
 * @param a - First snapshot
 * @param b - Second snapshot
 * @returns Array of byte-level differences
 */
export function diffMemory(a: Uint8Array, b: Uint8Array): MemoryDiff[] {
  if (a.length !== b.length) {
    throw new Error(`Snapshot length mismatch: ${a.length} vs ${b.length}`);
  }
  const diffs: MemoryDiff[] = [];
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      diffs.push({ offset: i, a: a[i]!, b: b[i]! });
    }
  }
  return diffs;
}

/**
 * Formats a diff report as a human-readable string.
 */
export function formatDiff(diffs: MemoryDiff[]): string {
  if (diffs.length === 0) return "No differences.";
  const lines = diffs.map(
    (d) =>
      `  offset 0x${d.offset.toString(16).padStart(4, "0")}: 0x${d.a.toString(16).padStart(2, "0")} -> 0x${d.b.toString(16).padStart(2, "0")}`,
  );
  return `${diffs.length} byte${diffs.length > 1 ? "s" : ""} differ:\n${lines.join("\n")}`;
}
