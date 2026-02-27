/**
 * Source map generation for Wasm DSL programs.
 *
 * Implements Source Map v3 format with VLQ encoding for mapping
 * generated Wasm byte offsets to original DSL source locations.
 *
 * @module
 */
import { compile, compileToIR, type CompileOptions } from "../dsl/interpreter";
import { moduleToWAT } from "./wat";
import type { WasmBinary, WasmProgram } from "../dsl/types";

/** A single source map entry mapping generated offset to original location. */
export interface SourceMapEntry {
  /** Byte offset in the generated Wasm binary. */
  generatedOffset: number;
  /** Line number in the original source (1-based). */
  originalLine: number;
  /** Column number in the original source (0-based). */
  originalColumn: number;
  /** Optional symbol name. */
  name?: string;
}

/** VLQ base64 encoding character set. */
const VLQ_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Encodes a signed integer as a VLQ base64 string.
 */
function encodeVLQ(value: number): string {
  let vlq = value < 0 ? (-value << 1) + 1 : value << 1;
  let encoded = "";
  do {
    let digit = vlq & 0x1f;
    vlq >>>= 5;
    if (vlq > 0) digit |= 0x20; // continuation bit
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

/**
 * Builds a Source Map v3 JSON string from entries.
 *
 * @param entries - Array of source map entries sorted by generatedOffset
 * @param sourceFile - Name of the original source file (default: "input.ts")
 * @param generatedFile - Name of the generated file (default: "output.wasm")
 * @returns Source map v3 JSON string
 */
export function buildSourceMap(
  entries: SourceMapEntry[],
  sourceFile = "input.ts",
  generatedFile = "output.wasm",
): string {
  const names: string[] = [];
  const nameIndex = new Map<string, number>();

  for (const entry of entries) {
    if (entry.name && !nameIndex.has(entry.name)) {
      nameIndex.set(entry.name, names.length);
      names.push(entry.name);
    }
  }

  // Sort entries by generated offset
  const sorted = [...entries].sort((a, b) => a.generatedOffset - b.generatedOffset);

  // Build mappings string
  // Each "line" in the generated file maps to a line in the source.
  // For Wasm, we treat the entire binary as one line with segments separated by commas.
  let prevGeneratedCol = 0;
  let prevOriginalLine = 0;
  let prevOriginalCol = 0;
  let prevNameIdx = 0;

  const segments: string[] = [];
  for (const entry of sorted) {
    let segment = "";

    // Generated column (offset from previous)
    segment += encodeVLQ(entry.generatedOffset - prevGeneratedCol);
    prevGeneratedCol = entry.generatedOffset;

    // Source file index (always 0)
    segment += encodeVLQ(0);

    // Original line (0-based in v3, entry uses 1-based)
    const line0 = entry.originalLine - 1;
    segment += encodeVLQ(line0 - prevOriginalLine);
    prevOriginalLine = line0;

    // Original column
    segment += encodeVLQ(entry.originalColumn - prevOriginalCol);
    prevOriginalCol = entry.originalColumn;

    // Optional name index
    if (entry.name) {
      const ni = nameIndex.get(entry.name)!;
      segment += encodeVLQ(ni - prevNameIdx);
      prevNameIdx = ni;
    }

    segments.push(segment);
  }

  const sourceMap = {
    version: 3,
    file: generatedFile,
    sources: [sourceFile],
    names,
    mappings: segments.join(","),
  };

  return JSON.stringify(sourceMap);
}

/**
 * Collector that accumulates source map entries during compilation.
 */
export class SourceMapCollector {
  private readonly _entries: SourceMapEntry[] = [];

  /** Adds an entry to the source map. */
  add(entry: SourceMapEntry): void {
    this._entries.push(entry);
  }

  /** Returns all collected entries. */
  get entries(): readonly SourceMapEntry[] {
    return this._entries;
  }

  /** Builds the source map v3 JSON string from collected entries. */
  build(sourceFile?: string, generatedFile?: string): string {
    return buildSourceMap(this._entries, sourceFile, generatedFile);
  }

  /** Resets the collector. */
  clear(): void {
    this._entries.length = 0;
  }
}

/**
 * Compiles a program and produces binary, WAT, and source map.
 *
 * @param program - Generator factory for the Wasm program
 * @param options - Compile options
 * @returns Object with binary, sourceMap JSON string, and WAT text
 */
export function compileWithSourceMap<T = Record<string, unknown>>(
  program: WasmProgram,
  options?: CompileOptions & { sourceFile?: string },
): { binary: WasmBinary<T>; sourceMap: string; wat: string } {
  // Compile to IR first for WAT generation
  const { funcs, moduleOptions } = compileToIR(program, {
    optimize: options?.optimize,
    optimizerConfig: options?.optimizerConfig,
  });

  // Generate WAT
  const wat = moduleToWAT(funcs, moduleOptions);

  // Compile to binary
  const binary = compile<T>(program, options);

  // Build source map from WAT line positions
  // Each WAT line that starts with a function or instruction gets an entry
  const collector = new SourceMapCollector();
  const lines = wat.split("\n");
  let byteOffset = 8; // skip magic + version header

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Map significant WAT lines to byte offsets
    if (
      trimmed.startsWith("(func") ||
      trimmed.startsWith("(export") ||
      trimmed.startsWith("(memory") ||
      trimmed.startsWith("(global") ||
      trimmed.startsWith("i32.") ||
      trimmed.startsWith("i64.") ||
      trimmed.startsWith("f32.") ||
      trimmed.startsWith("f64.") ||
      trimmed.startsWith("local.") ||
      trimmed.startsWith("global.") ||
      trimmed.startsWith("call") ||
      trimmed.startsWith("block") ||
      trimmed.startsWith("loop") ||
      trimmed.startsWith("br") ||
      trimmed.startsWith("if") ||
      trimmed.startsWith("else") ||
      trimmed.startsWith("end") ||
      trimmed.startsWith("return") ||
      trimmed.startsWith("drop") ||
      trimmed.startsWith("select") ||
      trimmed.startsWith("unreachable") ||
      trimmed.startsWith("nop") ||
      trimmed.startsWith("memory.")
    ) {
      collector.add({
        generatedOffset: byteOffset,
        originalLine: i + 1,
        originalColumn: line.length - line.trimStart().length,
      });
      byteOffset++;
    }
  }

  const sourceMap = collector.build(options?.sourceFile, "output.wasm");

  return { binary, sourceMap, wat };
}
