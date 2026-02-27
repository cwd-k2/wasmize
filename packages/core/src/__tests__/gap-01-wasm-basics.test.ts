import { describe, test, expect } from "vitest";
import { compile, Mod, Op, Mem, Type, f32 } from "../dsl/compiler";
import { instantiate } from "../runtime/instantiate";

// --- W-01: Start Section ---

describe("W-01: Start Section", () => {
  test("start function initializes memory on instantiation", async () => {
    const binary = compile<{ read(): number }>(function* () {
      const init = yield* Mod.func(function* () {
        yield* Mem.store(0, 42);
      });
      yield* Mod.start(init);
      yield* Mod.exportFunc("read", {}, function* () {
        return yield* Mem.load(0);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.read()).toBe(42);
  });
});

// --- W-02: Sign-Extension Operations ---

describe("W-02: Sign-Extension Operations", () => {
  test("i32.extend8_s(0xFF) = -1", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* v.extend8s();
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports as any).test(0xff)).toBe(-1);
  });

  test("i32.extend16_s(0xFFFF) = -1", async () => {
    const binary = compile<{ test(v: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* v.extend16s();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test(0xffff)).toBe(-1);
  });

  test("i32.extend8_s(0x7F) = 127", async () => {
    const binary = compile<{ test(v: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* v.extend8s();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test(0x7f)).toBe(127);
  });

  test("Op.convert.i32_extend8_s works", async () => {
    const binary = compile<{ test(v: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* Op.convert.i32_extend8_s(v);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test(0x80)).toBe(-128);
  });

  test("ChainableExpr.extend8s works", async () => {
    const binary = compile<{ test(v: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* v.and(0xff).extend8s();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test(0x1ff)).toBe(-1);
  });
});

// --- W-08: f32 DSL Wrapper ---

describe("W-08: f32 DSL Wrapper", () => {
  test("f32 constant and round-trip", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", {}, function* () {
        yield* Mem.storeF32(0, f32(3.14));
        return yield* Mem.loadF32(0).toF64();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test()).toBeCloseTo(3.14, 2);
  });

  test("f32Array read/write round-trip", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", {}, function* () {
        const arr = Mem.f32Array(0);
        yield* arr.store(0, f32(1.5));
        yield* arr.store(1, f32(2.5));
        return yield* arr.load(0).add(arr.load(1)).toF64();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test()).toBe(4);
  });
});

// --- W-14: i64 Bitwise/Comparison DSL (verify already works) ---

describe("W-14: i64 Bitwise/Comparison DSL", () => {
  test("i64 bitwise AND/OR/XOR", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", {}, function* () {
        // (0xFF & 0x0F) | 0xF0 = 0xFF, xor 0x0F = 0xF0 = 240
        const result = yield* Op.i64.xor(
          Op.i64.or(Op.i64.and(Mem.i64(0xff), Mem.i64(0x0f)), Mem.i64(0xf0)),
          Mem.i64(0x0f),
        );
        return yield* Op.wrap(result);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test()).toBe(0xf0);
  });

  test("i64 shift operations", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", {}, function* () {
        // (1 << 8) >> 4 = 16
        const shifted = yield* Op.i64.shr(Op.i64.shl(Mem.i64(1), Mem.i64(8)), Mem.i64(4));
        return yield* Op.wrap(shifted);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test()).toBe(16);
  });

  test("i64 unsigned comparisons", async () => {
    const binary = compile<{ test(): number }>(function* () {
      yield* Mod.exportFunc("test", {}, function* () {
        // lt_u: 5 < 10 = 1
        return yield* Op.i64.lt_u(Mem.i64(5), Mem.i64(10));
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test()).toBe(1);
  });
});

// --- D-06: rotl/rotr chain methods ---

describe("D-06: rotl/rotr chain methods", () => {
  test("WasmRef.rotl rotates left", async () => {
    const binary = compile<{ test(v: number, n: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32, n: Type.i32 }, function* (v, n) {
        return yield* v.rotl(n);
      });
    });
    const { exports } = await instantiate(binary);
    // rotl(1, 1) = 2
    expect(exports.test(1, 1)).toBe(2);
    // rotl(0x80000000, 1) = 1
    expect(exports.test(0x80000000 | 0, 1)).toBe(1);
  });

  test("WasmRef.rotr rotates right", async () => {
    const binary = compile<{ test(v: number, n: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32, n: Type.i32 }, function* (v, n) {
        return yield* v.rotr(n);
      });
    });
    const { exports } = await instantiate(binary);
    // rotr(1, 1) = 0x80000000
    expect(exports.test(1, 1)).toBe(0x80000000 | 0);
    // rotr(2, 1) = 1
    expect(exports.test(2, 1)).toBe(1);
  });

  test("ChainableExpr.rotl works", async () => {
    const binary = compile<{ test(v: number): number }>(function* () {
      yield* Mod.exportFunc("test", { v: Type.i32 }, function* (v) {
        return yield* v.add(0).rotl(4);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.test(0x12345678)).toBe(0x23456781 | 0);
  });
});
