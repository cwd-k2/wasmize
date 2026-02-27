import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Mem, Type, SortedArray } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { instantiate, instantiateFromUrl, instantiateFromResponse } from "../runtime/instantiate";
import type { InstantiateResult } from "../runtime/instantiate";
import { kmpBuildFailure, kmpSearch } from "../stdlib/string-algo";
import { matTranspose, matMulF64, matScale } from "../stdlib/matrix";
import { rgbToHsl, hslToRgb } from "../stdlib/color";
import { rgbToHex, hexToRgb, lerpColor } from "../runtime/color";

// ============================================================
// S-27: Sorted Array
// ============================================================
describe("S-27: SortedArray", () => {
  function makeSortedArrayModule() {
    return compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("test_insert_and_read", function* () {
        const sa = yield* SortedArray(0, 16);
        yield* sa.insert(30);
        yield* sa.insert(10);
        yield* sa.insert(20);
        yield* sa.insert(5);
        // Should be sorted: [5, 10, 20, 30]
        // Encode as 4-digit: at(0)*1000 + at(1)*100 + at(2)*10 + at(3)
        return yield* sa.at(0).mul(1000).add(sa.at(1).mul(100)).add(sa.at(2).mul(10)).add(sa.at(3));
      });

      yield* Mod.exportFunc("test_has", function* () {
        const sa = yield* SortedArray(256, 16);
        yield* sa.insert(10);
        yield* sa.insert(20);
        yield* sa.insert(30);
        const h1 = yield* local(Type.i32);
        const h2 = yield* local(Type.i32);
        const h3 = yield* local(Type.i32);
        yield* h1.set(yield* sa.has(20)); // 1
        yield* h2.set(yield* sa.has(15)); // 0
        yield* h3.set(yield* sa.has(30)); // 1
        return yield* h1.mul(100).add(h2.mul(10)).add(h3);
      });

      yield* Mod.exportFunc("test_delete", function* () {
        const sa = yield* SortedArray(512, 16);
        yield* sa.insert(10);
        yield* sa.insert(20);
        yield* sa.insert(30);
        yield* sa.delete(20);
        // Should be [10, 30], length 2
        const lenVal = yield* local(Type.i32);
        yield* lenVal.set(sa.length);
        const v0 = yield* local(Type.i32);
        const v1 = yield* local(Type.i32);
        yield* v0.set(sa.at(0));
        yield* v1.set(sa.at(1));
        return yield* lenVal.mul(10000).add(v0.mul(100)).add(v1);
      });

      yield* Mod.exportFunc("test_length", function* () {
        const sa = yield* SortedArray(768, 16);
        const l0 = yield* local(Type.i32);
        yield* l0.set(sa.length);
        yield* sa.insert(1);
        yield* sa.insert(2);
        yield* sa.insert(3);
        const l3 = yield* local(Type.i32);
        yield* l3.set(sa.length);
        yield* sa.delete(2);
        const l2 = yield* local(Type.i32);
        yield* l2.set(sa.length);
        return yield* l0.mul(100).add(l3.mul(10)).add(l2);
      });

      yield* Mod.exportFunc("test_duplicates", function* () {
        const sa = yield* SortedArray(1024, 16);
        yield* sa.insert(10);
        yield* sa.insert(10);
        yield* sa.insert(10);
        // Should allow duplicates: [10, 10, 10]
        const lenVal = yield* local(Type.i32);
        yield* lenVal.set(sa.length);
        return lenVal;
      });
    });
  }

  test("insert maintains sorted order", async () => {
    const binary = makeSortedArrayModule();
    const { exports } = await instantiate(binary);
    // [5, 10, 20, 30] => 5*1000 + 10*100 + 20*10 + 30 = 6230
    expect((exports.test_insert_and_read as Function)()).toBe(6230);
  });

  test("has returns correct results", async () => {
    const binary = makeSortedArrayModule();
    const { exports } = await instantiate(binary);
    // h1=1, h2=0, h3=1 => 1*100 + 0*10 + 1 = 101
    expect((exports.test_has as Function)()).toBe(101);
  });

  test("delete removes element correctly", async () => {
    const binary = makeSortedArrayModule();
    const { exports } = await instantiate(binary);
    // len=2, v0=10, v1=30 => 2*10000 + 10*100 + 30 = 21030
    expect((exports.test_delete as Function)()).toBe(21030);
  });

  test("length tracks insertions and deletions", async () => {
    const binary = makeSortedArrayModule();
    const { exports } = await instantiate(binary);
    // l0=0, l3=3, l2=2 => 0*100 + 3*10 + 2 = 32
    expect((exports.test_length as Function)()).toBe(32);
  });

  test("handles duplicate values", async () => {
    const binary = makeSortedArrayModule();
    const { exports } = await instantiate(binary);
    expect((exports.test_duplicates as Function)()).toBe(3);
  });
});

// ============================================================
// S-43: KMP String Matching
// ============================================================
describe("S-43: KMP String Matching", () => {
  // Memory layout:
  // text at 0, pattern at 256, failure table at 512
  const TEXT_BASE = 0;
  const PATTERN_BASE = 256;
  const FAILURE_BASE = 512;

  function makeKmpModule() {
    return compile(function* () {
      yield* Mod.memory(1);
      const buildFailure = yield* Mod.use(kmpBuildFailure);
      const search = yield* Mod.use(kmpSearch);

      // writeByte(addr, val)
      yield* Mod.exportFunc("writeByte", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store8(addr, val);
      });

      // search(textLen, patLen) -> i32
      yield* Mod.exportFunc("search", { textLen: Type.i32, patLen: Type.i32 }, function* (textLen, patLen) {
        yield* buildFailure.void(PATTERN_BASE, patLen, FAILURE_BASE);
        return yield* search(TEXT_BASE, textLen, PATTERN_BASE, patLen, FAILURE_BASE);
      });
    });
  }

  function writeString(exports: Record<string, unknown>, base: number, str: string) {
    const writeByte = exports.writeByte as Function;
    for (let i = 0; i < str.length; i++) {
      writeByte(base + i, str.charCodeAt(i));
    }
  }

  test("finds pattern at the beginning", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "ABCDEF");
    writeString(exports, PATTERN_BASE, "ABC");
    expect(search(6, 3)).toBe(0);
  });

  test("finds pattern in the middle", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "XYZABCDEF");
    writeString(exports, PATTERN_BASE, "ABC");
    expect(search(9, 3)).toBe(3);
  });

  test("finds pattern at the end", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "XYZABC");
    writeString(exports, PATTERN_BASE, "ABC");
    expect(search(6, 3)).toBe(3);
  });

  test("returns -1 when pattern not found", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "ABCDEF");
    writeString(exports, PATTERN_BASE, "XYZ");
    expect(search(6, 3)).toBe(-1);
  });

  test("handles overlapping pattern (KMP characteristic)", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    // "AABAABAAB" searching for "AABAAB"
    writeString(exports, TEXT_BASE, "AABAABAAB");
    writeString(exports, PATTERN_BASE, "AABAAB");
    expect(search(9, 6)).toBe(0);
  });

  test("single character match", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "HELLO");
    writeString(exports, PATTERN_BASE, "L");
    expect(search(5, 1)).toBe(2);
  });

  test("full text equals pattern", async () => {
    const binary = makeKmpModule();
    const { exports } = await instantiate(binary);
    const search = exports.search as Function;
    writeString(exports, TEXT_BASE, "EXACT");
    writeString(exports, PATTERN_BASE, "EXACT");
    expect(search(5, 5)).toBe(0);
  });
});

// ============================================================
// S-40: Matrix Operations
// ============================================================
describe("S-40: Matrix Operations", () => {
  describe("matTranspose", () => {
    test("transposes a 2x3 matrix", async () => {
      // src (2x3):  [[1,2,3],[4,5,6]]
      // dst (3x2):  [[1,4],[2,5],[3,6]]
      const SRC = 0;
      const DST = 256;

      const binary = compile(function* () {
        yield* Mod.memory(1);
        const transpose = yield* Mod.use(matTranspose);

        yield* Mod.exportFunc("run", function* () {
          yield* transpose.void(SRC, DST, 2, 3);
        });

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* Mem.i32Array(SRC).store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* Mem.i32Array(DST).load(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const run = exports.run as Function;
      const write = exports.write as Function;
      const read = exports.read as Function;

      // Write src: [1,2,3,4,5,6]
      [1, 2, 3, 4, 5, 6].forEach((v, i) => write(i, v));
      run();

      // Read dst: [1,4,2,5,3,6] (column-major read of original)
      expect(Array.from({ length: 6 }, (_, i) => read(i))).toEqual([1, 4, 2, 5, 3, 6]);
    });
  });

  describe("matScale", () => {
    test("scales all elements by scalar", async () => {
      const SRC = 0;
      const DST = 256;

      const binary = compile(function* () {
        yield* Mod.memory(1);
        const scale = yield* Mod.use(matScale);

        yield* Mod.exportFunc("run", { scalar: Type.i32 }, function* (scalar) {
          yield* scale.void(SRC, DST, 4, scalar);
        });

        yield* Mod.exportFunc("write", { idx: Type.i32, val: Type.i32 }, function* (idx, val) {
          yield* Mem.i32Array(SRC).store(idx, val);
        });

        yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
          return yield* Mem.i32Array(DST).load(idx);
        });
      });

      const { exports } = await instantiate(binary);
      const run = exports.run as Function;
      const write = exports.write as Function;
      const read = exports.read as Function;

      [2, 3, 4, 5].forEach((v, i) => write(i, v));
      run(3);

      expect(Array.from({ length: 4 }, (_, i) => read(i))).toEqual([6, 9, 12, 15]);
    });
  });

  describe("matMulF64", () => {
    test("multiplies 2x2 identity by 2x2 matrix", async () => {
      // A = 2x2 identity, B = [[1,2],[3,4]], C should = B
      const A_BASE = 0;       // 4 f64 = 32 bytes
      const B_BASE = 64;      // 4 f64 = 32 bytes
      const C_BASE = 128;     // 4 f64 = 32 bytes

      const binary = compile(function* () {
        yield* Mod.memory(1);
        const mul = yield* Mod.use(matMulF64);

        yield* Mod.exportFunc("run", function* () {
          yield* mul.void(A_BASE, B_BASE, C_BASE, 2, 2, 2);
        });

        yield* Mod.exportFunc("writeA", { idx: Type.i32, val: Type.f64 }, function* (idx, val) {
          yield* Mem.storeF64(idx.mul(8).add(A_BASE), val);
        });

        yield* Mod.exportFunc("writeB", { idx: Type.i32, val: Type.f64 }, function* (idx, val) {
          yield* Mem.storeF64(idx.mul(8).add(B_BASE), val);
        });

        yield* Mod.exportFunc("readC", { idx: Type.i32 }, function* (idx) {
          return yield* Mem.loadF64(idx.mul(8).add(C_BASE));
        });
      });

      const { exports } = await instantiate(binary);
      const run = exports.run as Function;
      const writeA = exports.writeA as Function;
      const writeB = exports.writeB as Function;
      const readC = exports.readC as Function;

      // Identity matrix A
      writeA(0, 1.0); writeA(1, 0.0);
      writeA(2, 0.0); writeA(3, 1.0);

      // Matrix B
      writeB(0, 1.0); writeB(1, 2.0);
      writeB(2, 3.0); writeB(3, 4.0);

      run();

      // C should equal B
      expect(readC(0)).toBeCloseTo(1.0);
      expect(readC(1)).toBeCloseTo(2.0);
      expect(readC(2)).toBeCloseTo(3.0);
      expect(readC(3)).toBeCloseTo(4.0);
    });

    test("multiplies two 2x2 matrices", async () => {
      // A = [[1,2],[3,4]], B = [[5,6],[7,8]]
      // C = [[1*5+2*7, 1*6+2*8],[3*5+4*7, 3*6+4*8]] = [[19,22],[43,50]]
      const A_BASE = 0;
      const B_BASE = 64;
      const C_BASE = 128;

      const binary = compile(function* () {
        yield* Mod.memory(1);
        const mul = yield* Mod.use(matMulF64);

        yield* Mod.exportFunc("run", function* () {
          yield* mul.void(A_BASE, B_BASE, C_BASE, 2, 2, 2);
        });

        yield* Mod.exportFunc("writeA", { idx: Type.i32, val: Type.f64 }, function* (idx, val) {
          yield* Mem.storeF64(idx.mul(8).add(A_BASE), val);
        });

        yield* Mod.exportFunc("writeB", { idx: Type.i32, val: Type.f64 }, function* (idx, val) {
          yield* Mem.storeF64(idx.mul(8).add(B_BASE), val);
        });

        yield* Mod.exportFunc("readC", { idx: Type.i32 }, function* (idx) {
          return yield* Mem.loadF64(idx.mul(8).add(C_BASE));
        });
      });

      const { exports } = await instantiate(binary);
      const run = exports.run as Function;
      const writeA = exports.writeA as Function;
      const writeB = exports.writeB as Function;
      const readC = exports.readC as Function;

      writeA(0, 1.0); writeA(1, 2.0);
      writeA(2, 3.0); writeA(3, 4.0);

      writeB(0, 5.0); writeB(1, 6.0);
      writeB(2, 7.0); writeB(3, 8.0);

      run();

      expect(readC(0)).toBeCloseTo(19.0);
      expect(readC(1)).toBeCloseTo(22.0);
      expect(readC(2)).toBeCloseTo(43.0);
      expect(readC(3)).toBeCloseTo(50.0);
    });
  });
});

// ============================================================
// R-06: Color Utilities
// ============================================================
describe("R-06: Color Utilities", () => {
  describe("Wasm rgbToHsl / hslToRgb", () => {
    // Memory layout: 6 f64 slots starting at byte 0 (48 bytes)
    const DST_H = 0;
    const DST_S = 8;
    const DST_L = 16;
    const DST_R = 24;
    const DST_G = 32;
    const DST_B = 40;

    function makeColorModule() {
      return compile(function* () {
        yield* Mod.memory(1);
        const toHsl = yield* Mod.use(rgbToHsl);
        const toRgb = yield* Mod.use(hslToRgb);

        yield* Mod.exportFunc(
          "rgbToHsl",
          { r: Type.f64, g: Type.f64, b: Type.f64 },
          function* (r, g, b) {
            yield* toHsl.void(r, g, b, DST_H, DST_S, DST_L);
          },
        );

        yield* Mod.exportFunc(
          "hslToRgb",
          { h: Type.f64, s: Type.f64, l: Type.f64 },
          function* (h, s, l) {
            yield* toRgb.void(h, s, l, DST_R, DST_G, DST_B);
          },
        );

        yield* Mod.exportFunc("readH", function* () {
          return yield* Mem.loadF64(DST_H);
        });
        yield* Mod.exportFunc("readS", function* () {
          return yield* Mem.loadF64(DST_S);
        });
        yield* Mod.exportFunc("readL", function* () {
          return yield* Mem.loadF64(DST_L);
        });
        yield* Mod.exportFunc("readR", function* () {
          return yield* Mem.loadF64(DST_R);
        });
        yield* Mod.exportFunc("readG", function* () {
          return yield* Mem.loadF64(DST_G);
        });
        yield* Mod.exportFunc("readB", function* () {
          return yield* Mem.loadF64(DST_B);
        });
      });
    }

    test("pure red RGB -> HSL", async () => {
      const binary = makeColorModule();
      const { exports } = await instantiate(binary);
      const toHsl = exports.rgbToHsl as Function;
      const readH = exports.readH as Function;
      const readS = exports.readS as Function;
      const readL = exports.readL as Function;

      toHsl(1.0, 0.0, 0.0);
      expect(readH()).toBeCloseTo(0.0, 4);
      expect(readS()).toBeCloseTo(1.0, 4);
      expect(readL()).toBeCloseTo(0.5, 4);
    });

    test("pure green RGB -> HSL", async () => {
      const binary = makeColorModule();
      const { exports } = await instantiate(binary);
      const toHsl = exports.rgbToHsl as Function;
      const readH = exports.readH as Function;
      const readS = exports.readS as Function;
      const readL = exports.readL as Function;

      toHsl(0.0, 1.0, 0.0);
      expect(readH()).toBeCloseTo(120.0, 4);
      expect(readS()).toBeCloseTo(1.0, 4);
      expect(readL()).toBeCloseTo(0.5, 4);
    });

    test("gray (achromatic) RGB -> HSL", async () => {
      const binary = makeColorModule();
      const { exports } = await instantiate(binary);
      const toHsl = exports.rgbToHsl as Function;
      const readH = exports.readH as Function;
      const readS = exports.readS as Function;
      const readL = exports.readL as Function;

      toHsl(0.5, 0.5, 0.5);
      expect(readH()).toBeCloseTo(0.0, 4);
      expect(readS()).toBeCloseTo(0.0, 4);
      expect(readL()).toBeCloseTo(0.5, 4);
    });

    test("HSL to RGB round-trip for pure blue", async () => {
      const binary = makeColorModule();
      const { exports } = await instantiate(binary);
      const toRgb = exports.hslToRgb as Function;
      const readR = exports.readR as Function;
      const readG = exports.readG as Function;
      const readB = exports.readB as Function;

      // Blue: H=240, S=1, L=0.5
      toRgb(240.0, 1.0, 0.5);
      expect(readR()).toBeCloseTo(0.0, 4);
      expect(readG()).toBeCloseTo(0.0, 4);
      expect(readB()).toBeCloseTo(1.0, 4);
    });

    test("HSL achromatic -> RGB", async () => {
      const binary = makeColorModule();
      const { exports } = await instantiate(binary);
      const toRgb = exports.hslToRgb as Function;
      const readR = exports.readR as Function;
      const readG = exports.readG as Function;
      const readB = exports.readB as Function;

      // Gray: H=0, S=0, L=0.5
      toRgb(0.0, 0.0, 0.5);
      expect(readR()).toBeCloseTo(0.5, 4);
      expect(readG()).toBeCloseTo(0.5, 4);
      expect(readB()).toBeCloseTo(0.5, 4);
    });
  });

  describe("JS color utilities", () => {
    test("rgbToHex produces correct hex strings", () => {
      expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
      expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
      expect(rgbToHex(0, 0, 255)).toBe("#0000ff");
      expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
      expect(rgbToHex(0, 0, 0)).toBe("#000000");
      expect(rgbToHex(16, 32, 48)).toBe("#102030");
    });

    test("hexToRgb parses hex strings", () => {
      expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
      expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 });
      expect(hexToRgb("#102030")).toEqual({ r: 16, g: 32, b: 48 });
    });

    test("hexToRgb handles shorthand", () => {
      expect(hexToRgb("#f00")).toEqual({ r: 255, g: 0, b: 0 });
      expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
    });

    test("hexToRgb without # prefix", () => {
      expect(hexToRgb("ff0000")).toEqual({ r: 255, g: 0, b: 0 });
    });

    test("rgbToHex and hexToRgb round-trip", () => {
      const original = { r: 123, g: 45, b: 67 };
      const hex = rgbToHex(original.r, original.g, original.b);
      const result = hexToRgb(hex);
      expect(result).toEqual(original);
    });

    test("lerpColor interpolates correctly", () => {
      const black = { r: 0, g: 0, b: 0 };
      const white = { r: 255, g: 255, b: 255 };

      const mid = lerpColor(black, white, 0.5);
      expect(mid.r).toBeCloseTo(127.5);
      expect(mid.g).toBeCloseTo(127.5);
      expect(mid.b).toBeCloseTo(127.5);

      const start = lerpColor(black, white, 0);
      expect(start).toEqual(black);

      const end = lerpColor(black, white, 1);
      expect(end).toEqual(white);
    });

    test("lerpColor between two arbitrary colors", () => {
      const c1 = { r: 100, g: 0, b: 200 };
      const c2 = { r: 200, g: 100, b: 0 };
      const mid = lerpColor(c1, c2, 0.5);
      expect(mid.r).toBeCloseTo(150);
      expect(mid.g).toBeCloseTo(50);
      expect(mid.b).toBeCloseTo(100);
    });
  });
});

// ============================================================
// R-02: Streaming Instantiation
// ============================================================
describe("R-02: Streaming Instantiation", () => {
  test("instantiateFromUrl is exported and is a function", () => {
    expect(typeof instantiateFromUrl).toBe("function");
  });

  test("instantiateFromResponse is exported and is a function", () => {
    expect(typeof instantiateFromResponse).toBe("function");
  });

  test("InstantiateResult type is usable", () => {
    // Type-level check: ensure InstantiateResult type is importable and structurally valid
    type CheckExports = InstantiateResult<{ add: (a: number, b: number) => number }>;
    const _check: CheckExports["exports"] extends { add: Function; memory?: WebAssembly.Memory } ? true : never = true;
    expect(_check).toBe(true);
  });

  test("instantiate still works as before", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("double", { x: Type.i32 }, function* (x) {
        return yield* x.mul(2);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.double as Function)(21)).toBe(42);
  });
});
