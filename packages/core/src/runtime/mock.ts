/**
 * Import mock framework for Wasm binaries.
 *
 * {@link mockImports} parses a compiled Wasm binary's import section and
 * auto-generates mock functions matching each import's signature. Specific
 * overrides can be provided; any remaining imports are filled with no-op
 * (void) or zero-returning stubs.
 *
 * @module
 */

/** Reads an unsigned LEB128 value from a Uint8Array at the given offset. */
function readLEB128(bytes: Uint8Array, offset: number): { value: number; size: number } {
  let result = 0;
  let shift = 0;
  let size = 0;
  let byte: number;
  do {
    byte = bytes[offset + size]!;
    result |= (byte & 0x7f) << shift;
    shift += 7;
    size++;
  } while (byte & 0x80);
  return { value: result, size };
}

/** Reads a UTF-8 string of given length from bytes at offset. */
function readString(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder().decode(bytes.subarray(offset, offset + length));
}

const TYPE_BYTE_TO_NAME: Record<number, string> = {
  0x7f: "i32",
  0x7e: "i64",
  0x7d: "f32",
  0x7c: "f64",
};

interface ImportEntry {
  module: string;
  name: string;
  /** 0x00 = func, 0x01 = table, 0x02 = memory, 0x03 = global */
  kind: number;
  /** For func imports: index into the type section */
  typeIdx: number;
}

interface TypeEntry {
  params: string[];
  results: string[];
}

/**
 * Parses the type section (section 1) and import section (section 2)
 * from a Wasm binary.
 */
function parseImportInfo(binary: Uint8Array): {
  types: TypeEntry[];
  imports: ImportEntry[];
} {
  // Validate magic + version (8 bytes)
  let pos = 8;
  const types: TypeEntry[] = [];
  const imports: ImportEntry[] = [];

  while (pos < binary.length) {
    const sectionId = binary[pos]!;
    pos++;
    const { value: sectionSize, size: sizeBytes } = readLEB128(binary, pos);
    pos += sizeBytes;
    const sectionEnd = pos + sectionSize;

    if (sectionId === 1) {
      // Type section
      const { value: typeCount, size: tcSize } = readLEB128(binary, pos);
      let tpos = pos + tcSize;
      for (let t = 0; t < typeCount; t++) {
        // 0x60 = func type
        tpos++; // skip 0x60
        const { value: paramCount, size: pcSize } = readLEB128(binary, tpos);
        tpos += pcSize;
        const params: string[] = [];
        for (let p = 0; p < paramCount; p++) {
          params.push(TYPE_BYTE_TO_NAME[binary[tpos]!] || "i32");
          tpos++;
        }
        const { value: resultCount, size: rcSize } = readLEB128(binary, tpos);
        tpos += rcSize;
        const results: string[] = [];
        for (let r = 0; r < resultCount; r++) {
          results.push(TYPE_BYTE_TO_NAME[binary[tpos]!] || "i32");
          tpos++;
        }
        types.push({ params, results });
      }
    } else if (sectionId === 2) {
      // Import section
      const { value: importCount, size: icSize } = readLEB128(binary, pos);
      let ipos = pos + icSize;
      for (let i = 0; i < importCount; i++) {
        // module name
        const { value: modLen, size: mlSize } = readLEB128(binary, ipos);
        ipos += mlSize;
        const module = readString(binary, ipos, modLen);
        ipos += modLen;
        // import name
        const { value: nameLen, size: nlSize } = readLEB128(binary, ipos);
        ipos += nlSize;
        const name = readString(binary, ipos, nameLen);
        ipos += nameLen;
        // kind
        const kind = binary[ipos]!;
        ipos++;

        let typeIdx = 0;
        if (kind === 0x00) {
          // func import — type index follows
          const { value: ti, size: tiSize } = readLEB128(binary, ipos);
          typeIdx = ti;
          ipos += tiSize;
        } else if (kind === 0x01) {
          // table import — skip element type + limits
          ipos++; // element type
          const flags = binary[ipos]!;
          ipos++;
          const { size: minSize } = readLEB128(binary, ipos);
          ipos += minSize;
          if (flags & 0x01) {
            const { size: maxSize } = readLEB128(binary, ipos);
            ipos += maxSize;
          }
        } else if (kind === 0x02) {
          // memory import — skip limits
          const flags = binary[ipos]!;
          ipos++;
          const { size: minSize } = readLEB128(binary, ipos);
          ipos += minSize;
          if (flags & 0x01) {
            const { size: maxSize } = readLEB128(binary, ipos);
            ipos += maxSize;
          }
        } else if (kind === 0x03) {
          // global import — skip type + mutability
          ipos += 2;
        }

        imports.push({ module, name, kind, typeIdx });
      }
    }

    pos = sectionEnd;
    // Stop after import section (section 2) — no need to parse further
    if (sectionId >= 2) break;
  }

  return { types, imports };
}

/** Creates a stub function for a given type signature. */
function createStub(type: TypeEntry): Function {
  if (type.results.length === 0) {
    // Void function — no-op
    return () => {};
  }
  // Return appropriate zero value for the first result type
  const resultType = type.results[0];
  if (resultType === "i64") {
    return () => 0n;
  }
  return () => 0;
}

/**
 * Generates mock imports for a Wasm binary.
 *
 * Parses the binary's import section to discover required imports,
 * then builds an imports object with auto-generated stubs.
 * Specific overrides can be supplied in `overrides` — those take precedence.
 *
 * @param binary - Compiled Wasm binary
 * @param overrides - Specific mock functions to use (module -> name -> fn)
 * @returns Import object suitable for `WebAssembly.instantiate`
 */
export function mockImports(
  binary: Uint8Array,
  overrides: Record<string, Record<string, Function>> = {},
): WebAssembly.Imports {
  const { types, imports } = parseImportInfo(binary);
  const result: Record<string, Record<string, Function>> = {};

  for (const imp of imports) {
    if (imp.kind !== 0x00) continue; // Only mock function imports

    if (!result[imp.module]) {
      result[imp.module] = {};
    }

    // Check for user-provided override
    const override = overrides[imp.module]?.[imp.name];
    if (override) {
      result[imp.module]![imp.name] = override;
    } else {
      // Auto-generate stub based on type
      const type = types[imp.typeIdx];
      if (type) {
        result[imp.module]![imp.name] = createStub(type);
      } else {
        // Fallback: no-op
        result[imp.module]![imp.name] = () => {};
      }
    }
  }

  return result;
}
