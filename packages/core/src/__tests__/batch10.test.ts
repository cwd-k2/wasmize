import { describe, test, expect } from "vitest";
import { compile, compileWithDiagnostics } from "../dsl/compiler";
import { Mod, Mem, Type, Tuple } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";
import { createConstantFoldingWithWarnings, builtinPasses } from "../wasm/optimize";

// ============================================================
// W-09: i16/i8 Memory Operation Helpers
// ============================================================
describe("W-09: i16/i8 Memory Operation Helpers", () => {
  describe("i16Array", () => {
    test("read/write round-trip", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i16Array(0);

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* arr.store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* arr.load(idx);
        });

        yield* Mod.exportFunc("readSigned", { idx: Type.i32 }, function* (idx) {
          return yield* arr.loadSigned(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const write = exports.write as Function;
      const read = exports.read as Function;
      const readSigned = exports.readSigned as Function;

      write(0, 100);
      write(1, 200);
      write(2, 65535); // 0xFFFF
      expect(read(0)).toBe(100);
      expect(read(1)).toBe(200);
      expect(read(2)).toBe(65535); // zero-extended
      expect(readSigned(2)).toBe(-1); // sign-extended
    });

    test("with base offset", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i16Array(100);

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* arr.store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* arr.load(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const write = exports.write as Function;
      const read = exports.read as Function;

      write(0, 42);
      write(1, 84);
      expect(read(0)).toBe(42);
      expect(read(1)).toBe(84);
    });

    test("at() returns FieldAccessor with set and incrBy", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i16Array(0);

        yield* Mod.exportFunc("test", function* () {
          yield* arr.at(0).set(100);
          yield* arr.at(1).set(200);
          yield* arr.at(0).incrBy(50);
          return yield* arr.at(0).add(arr.at(1));
        });
      });

      const { exports } = await instantiate(binary);
      expect((exports.test as Function)()).toBe(350); // (100+50) + 200
    });
  });

  describe("i8Array", () => {
    test("read/write round-trip", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i8Array(0);

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* arr.store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* arr.load(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const write = exports.write as Function;
      const read = exports.read as Function;

      write(0, 42);
      write(1, 255);
      write(2, 0);
      expect(read(0)).toBe(42);
      expect(read(1)).toBe(255);
      expect(read(2)).toBe(0);
    });

    test("with base offset", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i8Array(64);

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* arr.store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* arr.load(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const write = exports.write as Function;
      const read = exports.read as Function;

      write(0, 10);
      write(3, 99);
      expect(read(0)).toBe(10);
      expect(read(3)).toBe(99);
    });

    test("at() returns FieldAccessor", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i8Array(0);

        yield* Mod.exportFunc("test", function* () {
          yield* arr.at(0).set(10);
          yield* arr.at(1).set(20);
          return yield* arr.at(0).add(arr.at(1));
        });
      });

      const { exports } = await instantiate(binary);
      expect((exports.test as Function)()).toBe(30);
    });
  });
});

// ============================================================
// W-11: Name Section (debug info)
// ============================================================
describe("W-11: Name Section", () => {
  test("name section exists when debug:true", () => {
    const binary = compile(
      function* () {
        yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
      },
      { debug: true },
    );

    // Parse the binary to find the name section
    // Custom section has id 0, then a name "name"
    const bytes = new Uint8Array(binary);
    let offset = 8; // skip magic + version
    let foundNameSection = false;

    while (offset < bytes.length) {
      const sectionId = bytes[offset]!;
      offset++;

      // Read section size (LEB128)
      let size = 0;
      let shift = 0;
      let byte;
      do {
        byte = bytes[offset]!;
        offset++;
        size |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);

      if (sectionId === 0) {
        // Custom section - check if name is "name"
        const contentStart = offset;
        // Read name length (LEB128)
        let nameLen = 0;
        shift = 0;
        do {
          byte = bytes[offset]!;
          offset++;
          nameLen |= (byte & 0x7f) << shift;
          shift += 7;
        } while (byte & 0x80);

        // Read name bytes
        const nameBytes = bytes.slice(offset, offset + nameLen);
        const name = new TextDecoder().decode(nameBytes);

        if (name === "name") {
          foundNameSection = true;

          // Verify sub-section 1 (function names)
          offset += nameLen;
          const subId = bytes[offset]!;
          expect(subId).toBe(0x01); // function names sub-section
        }
        offset = contentStart + size;
      } else {
        offset += size;
      }
    }

    expect(foundNameSection).toBe(true);
  });

  test("no name section when debug:false or omitted", () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });

    const bytes = new Uint8Array(binary);
    let offset = 8;
    let foundNameSection = false;

    while (offset < bytes.length) {
      const sectionId = bytes[offset]!;
      offset++;

      let size = 0;
      let shift = 0;
      let byte;
      do {
        byte = bytes[offset]!;
        offset++;
        size |= (byte & 0x7f) << shift;
        shift += 7;
      } while (byte & 0x80);

      if (sectionId === 0) {
        // Read the custom section name
        let nameLen = 0;
        shift = 0;
        const contentStart = offset;
        do {
          byte = bytes[offset]!;
          offset++;
          nameLen |= (byte & 0x7f) << shift;
          shift += 7;
        } while (byte & 0x80);

        const nameBytes = bytes.slice(offset, offset + nameLen);
        const name = new TextDecoder().decode(nameBytes);

        if (name === "name") {
          foundNameSection = true;
        }
        offset = contentStart + size;
      } else {
        offset += size;
      }
    }

    expect(foundNameSection).toBe(false);
  });

  test("debug binary still works correctly", async () => {
    const binary = compile(
      function* () {
        yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
      },
      { debug: true },
    );

    const { exports } = await instantiate(binary);
    expect((exports.add as Function)(3, 4)).toBe(7);
  });
});

// ============================================================
// D-03: Tuple (Multi-Value Sugar)
// ============================================================
describe("D-03: Tuple (Multi-Value Sugar)", () => {
  test("pack and unpack round-trip", async () => {
    const binary = compile(function* () {
      // Internal function that returns two i32 values
      const swap = yield* Mod.func(
        { a: Type.i32, b: Type.i32 },
        function* (a, b) {
          return yield* Tuple.pack(b, a);
        },
      );

      yield* Mod.exportFunc("test", { x: Type.i32, y: Type.i32 }, function* (x, y) {
        const [a, b] = yield* Tuple.unpack(swap(x, y), [Type.i32, Type.i32]);
        // a should be y, b should be x
        return yield* a.mul(10).add(b);
      });
    });

    const { exports } = await instantiate(binary);
    const test = exports.test as Function;
    // swap(3, 7) -> [7, 3], so 7*10 + 3 = 73
    expect(test(3, 7)).toBe(73);
  });

  test("pack with constants", async () => {
    const binary = compile(function* () {
      const getPair = yield* Mod.func(function* () {
        return yield* Tuple.pack(42, 99);
      });

      yield* Mod.exportFunc("test", function* () {
        const [a, b] = yield* Tuple.unpack(getPair(), [Type.i32, Type.i32]);
        return yield* a.add(b);
      });
    });

    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(141); // 42 + 99
  });

  test("pack with three values", async () => {
    const binary = compile(function* () {
      const getTriple = yield* Mod.func(function* () {
        return yield* Tuple.pack(10, 20, 30);
      });

      yield* Mod.exportFunc("test", function* () {
        const [a, b, c] = yield* Tuple.unpack(getTriple(), [Type.i32, Type.i32, Type.i32]);
        return yield* a.mul(100).add(b.mul(10)).add(c);
      });
    });

    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(1230); // 10*100 + 20*10 + 30
  });
});

// ============================================================
// V-11: Constant Expression Overflow Detection
// ============================================================
describe("V-11: Constant Expression Overflow Detection", () => {
  test("i32 overflow throws compile error", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.exportFunc("test", function* () {
          return yield* Mem.i32(2147483648); // 2^31, exceeds i32 max
        });
      });
    }).toThrow(/i32 constant overflow/);
  });

  test("i32 underflow throws compile error", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.exportFunc("test", function* () {
          return yield* Mem.i32(-2147483649); // -2^31 - 1, exceeds i32 min
        });
      });
    }).toThrow(/i32 constant overflow/);
  });

  test("i32 at boundaries is OK", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.exportFunc("test", function* () {
          const a = yield* local(Type.i32);
          yield* a.set(Mem.i32(2147483647));
          yield* a.set(Mem.i32(-2147483648));
          return a;
        });
      });
    }).not.toThrow();
  });

  test("constant folding overflow warning via createConstantFoldingWithWarnings", () => {
    const warnings: string[] = [];
    const foldingPass = createConstantFoldingWithWarnings((msg) => warnings.push(msg));

    // Replace constant-folding with the warning version
    const passes = builtinPasses.map((p) => (p.name === "constant-folding" ? foldingPass : p));

    compile(
      function* () {
        yield* Mod.exportFunc("test", function* () {
          // 2000000000 + 2000000000 = 4000000000, overflows i32
          return yield* Mem.i32(2000000000).add(Mem.i32(2000000000));
        });
      },
      { optimizerConfig: { passes } },
    );

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("overflow");
  });
});

// ============================================================
// V-12: Unused Local Variable Warning
// ============================================================
describe("V-12: Unused Local Variable Warning", () => {
  test("detects unused local variable", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.exportFunc("test", function* () {
        yield* local(Type.i32); // unused local
        return 42;
      });
    });

    const warnings = result.diagnostics.filter(
      (d) => d.code === "V-12" && d.level === "warning",
    );
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]!.message).toContain("Unused local");
  });

  test("no warning for used local variable", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.exportFunc("test", function* () {
        const x = yield* local(Type.i32);
        yield* x.set(42);
        return x;
      });
    });

    const warnings = result.diagnostics.filter(
      (d) => d.code === "V-12" && d.level === "warning",
    );
    expect(warnings).toHaveLength(0);
  });

  test("no warning for params", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.exportFunc("test", { a: Type.i32 }, function* (_a) {
        // param a is declared but not used — V-12 only checks locals, not params
        return 0;
      });
    });

    const warnings = result.diagnostics.filter(
      (d) => d.code === "V-12" && d.level === "warning",
    );
    expect(warnings).toHaveLength(0);
  });

  test("binary is still produced despite warnings", async () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.exportFunc("test", function* () {
        yield* local(Type.i32); // unused local
        return 42;
      });
    });

    expect(result.binary).toBeDefined();
    const { exports } = await instantiate(result.binary!);
    expect((exports.test as Function)()).toBe(42);
  });
});
