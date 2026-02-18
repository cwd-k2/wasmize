import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Op, Mem, Ctrl } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("i32 unsigned ops", () => {
  test("div_u treats operands as unsigned", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("div_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.div_u(a, b);
      });
    });
    const { exports: { div_u } } = await instantiate(binary);
    const f = div_u as (a: number, b: number) => number;
    expect(f(10, 3)).toBe(3);
    // 0xFFFFFFFF unsigned = 4294967295, / 2 = 2147483647
    expect(f(-1, 2)).toBe(2147483647);
  });

  test("rem_u treats operands as unsigned", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("rem_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.rem_u(a, b);
      });
    });
    const { exports: { rem_u } } = await instantiate(binary);
    const f = rem_u as (a: number, b: number) => number;
    expect(f(10, 3)).toBe(1);
    // 0xFFFFFFFF % 2 = 1
    expect(f(-1, 2)).toBe(1);
  });

  test("shr_u shifts without sign extension", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("shr_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.shr_u(a, b);
      });
    });
    const { exports: { shr_u } } = await instantiate(binary);
    const f = shr_u as (a: number, b: number) => number;
    // -1 (0xFFFFFFFF) >>> 1 = 0x7FFFFFFF = 2147483647
    expect(f(-1, 1)).toBe(2147483647);
  });

  test("unsigned comparisons", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("lt_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.lt_u(a, b);
      });
      yield* Mod.exportFunc("gt_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.gt_u(a, b);
      });
      yield* Mod.exportFunc("le_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.le_u(a, b);
      });
      yield* Mod.exportFunc("ge_u", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.ge_u(a, b);
      });
    });
    const { exports } = await instantiate(binary);
    const lt_u = exports.lt_u as Function;
    const gt_u = exports.gt_u as Function;
    const le_u = exports.le_u as Function;
    const ge_u = exports.ge_u as Function;

    // -1 as unsigned is MAX_UINT32 — greater than any positive
    expect(lt_u(-1, 1)).toBe(0); // unsigned: big > 1
    expect(gt_u(-1, 1)).toBe(1);
    expect(le_u(5, 5)).toBe(1);
    expect(ge_u(3, 5)).toBe(0);
  });
});

describe("i64 arithmetic", () => {
  test("add/sub/mul/div with i64 locals", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("i64_ops", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        // Extend i32 inputs to i64, do arithmetic, wrap back to i32
        const a64 = yield* Op.extend(a);
        const b64 = yield* Op.extend(b);
        const sum = yield* Op.i64.add(a64, b64);
        return yield* Op.wrap(sum);
      });
    });
    const { exports: { i64_ops } } = await instantiate(binary);
    const f = i64_ops as (a: number, b: number) => number;
    expect(f(100, 200)).toBe(300);
  });

  test("i64 sub and mul", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("sub64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.sub(Op.extend(a), Op.extend(b)));
      });
      yield* Mod.exportFunc("mul64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.mul(Op.extend(a), Op.extend(b)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.sub64 as Function)(10, 3)).toBe(7);
    expect((exports.mul64 as Function)(6, 7)).toBe(42);
  });

  test("i64 div", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("div64", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Op.wrap(Op.i64.div(Op.extend(a), Op.extend(b)));
      });
    });
    const { exports: { div64 } } = await instantiate(binary);
    expect((div64 as Function)(42, 6)).toBe(7);
  });
});

describe("i64 eqz", () => {
  test("returns 1 for zero, 0 for non-zero", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("eqz64", { a: Type.i32 }, function* (a) {
        return yield* Op.i64.eqz(Op.extend(a));
      });
    });
    const { exports: { eqz64 } } = await instantiate(binary);
    const f = eqz64 as (a: number) => number;
    expect(f(0)).toBe(1);
    expect(f(1)).toBe(0);
    expect(f(42)).toBe(0);
  });
});

describe("f64 arithmetic", () => {
  test("add/sub/mul/div with f64 constants", async () => {
    const binary = compile(function* () {
      // f64 add: 1.5 + 2.5 → truncate to i32 → 4
      yield* Mod.exportFunc("f64_add", function* () {
        const result = yield* Op.f64.add(Mem.f64(1.5), Mem.f64(2.5));
        return yield* Op.truncI32(result);
      });
      // f64 sub: 10.7 - 3.2 → 7.5 → truncate → 7
      yield* Mod.exportFunc("f64_sub", function* () {
        return yield* Op.truncI32(Op.f64.sub(Mem.f64(10.7), Mem.f64(3.2)));
      });
      // f64 mul: 3.0 * 4.0 → 12.0 → 12
      yield* Mod.exportFunc("f64_mul", function* () {
        return yield* Op.truncI32(Op.f64.mul(Mem.f64(3.0), Mem.f64(4.0)));
      });
      // f64 div: 15.0 / 4.0 → 3.75 → 3
      yield* Mod.exportFunc("f64_div", function* () {
        return yield* Op.truncI32(Op.f64.div(Mem.f64(15.0), Mem.f64(4.0)));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.f64_add as Function)()).toBe(4);
    expect((exports.f64_sub as Function)()).toBe(7);
    expect((exports.f64_mul as Function)()).toBe(12);
    expect((exports.f64_div as Function)()).toBe(3);
  });
});

describe("f64 unary", () => {
  test("neg flips sign", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f64_neg", function* () {
        return yield* Op.truncI32(Op.f64.neg(Mem.f64(5.0)));
      });
    });
    const { exports: { f64_neg } } = await instantiate(binary);
    expect((f64_neg as Function)()).toBe(-5);
  });

  test("abs returns absolute value", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("f64_abs", function* () {
        return yield* Op.truncI32(Op.f64.abs(Mem.f64(-7.0)));
      });
    });
    const { exports: { f64_abs } } = await instantiate(binary);
    expect((f64_abs as Function)()).toBe(7);
  });
});

describe("conversions", () => {
  test("i32 → i64 → i32 round-trip (extend + wrap)", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("roundtrip", { x: Type.i32 }, function* (x) {
        return yield* Op.wrap(Op.extend(x));
      });
    });
    const { exports: { roundtrip } } = await instantiate(binary);
    expect((roundtrip as Function)(42)).toBe(42);
    expect((roundtrip as Function)(-1)).toBe(-1);
  });

  test("i32 → f64 → i32 round-trip (toF64 + truncI32)", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("roundtrip", { x: Type.i32 }, function* (x) {
        return yield* Op.truncI32(Op.toF64(x));
      });
    });
    const { exports: { roundtrip } } = await instantiate(binary);
    expect((roundtrip as Function)(42)).toBe(42);
    expect((roundtrip as Function)(-100)).toBe(-100);
  });

  test("f64 arithmetic and truncation", async () => {
    const binary = compile(function* () {
      // (3.7 + 2.1) → 5.8 → trunc → 5
      yield* Mod.exportFunc("calc", function* () {
        return yield* Op.truncI32(Op.f64.add(Mem.f64(3.7), Mem.f64(2.1)));
      });
    });
    const { exports: { calc } } = await instantiate(binary);
    expect((calc as Function)()).toBe(5);
  });
});

describe("memory i64/f64", () => {
  test("storeI64 / loadI64", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("store64", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.storeI64(addr, Op.extend(val));
      });
      yield* Mod.exportFunc("load64", { addr: Type.i32 }, function* (addr) {
        return yield* Op.wrap(Mem.loadI64(addr));
      });
    });
    const { exports } = await instantiate(binary);
    const store64 = exports.store64 as Function;
    const load64 = exports.load64 as Function;
    store64(0, 42);
    expect(load64(0)).toBe(42);
    store64(8, -1);
    expect(load64(8)).toBe(-1);
  });

  test("storeF64 / loadF64", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("storeF", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.storeF64(addr, Op.toF64(val));
      });
      yield* Mod.exportFunc("loadF", { addr: Type.i32 }, function* (addr) {
        return yield* Op.truncI32(Mem.loadF64(addr));
      });
    });
    const { exports } = await instantiate(binary);
    const storeF = exports.storeF as Function;
    const loadF = exports.loadF as Function;
    storeF(0, 99);
    expect(loadF(0)).toBe(99);
    storeF(8, -50);
    expect(loadF(8)).toBe(-50);
  });
});

describe("system", () => {
  test("Mem.size returns initial memory size", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(2);
      yield* Mod.exportFunc("memSize", function* () {
        return yield* Mem.size();
      });
    });
    const { exports: { memSize } } = await instantiate(binary);
    expect((memSize as Function)()).toBe(2);
  });

  test("Mem.grow increases memory and returns previous size", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("growAndCheck", function* () {
        const prev = yield* Mem.grow(3);
        const cur = yield* Mem.size();
        return yield* Op.add(prev, cur); // 1 + 4 = 5
      });
    });
    const { exports: { growAndCheck } } = await instantiate(binary);
    expect((growAndCheck as Function)()).toBe(5);
  });

  test("Ctrl.unreachable traps", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("trap", function* () {
        yield* Ctrl.unreachable();
      });
    });
    const { exports: { trap } } = await instantiate(binary);
    expect(() => (trap as Function)()).toThrow();
  });
});

describe("f64 const", () => {
  test("Mem.f64 creates f64 constant", async () => {
    const binary = compile(function* () {
      // Store f64 constant to memory, read back as i32 truncated
      yield* Mod.exportFunc("pi_trunc", function* () {
        return yield* Op.truncI32(Mem.f64(3.14159));
      });
    });
    const { exports: { pi_trunc } } = await instantiate(binary);
    expect((pi_trunc as Function)()).toBe(3);
  });
});

describe("i64 const", () => {
  test("Mem.i64 + extend/wrap round-trip", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("i64const", function* () {
        const v = yield* Op.i64.add(Mem.i64(100), Mem.i64(200));
        return yield* Op.wrap(v);
      });
    });
    const { exports: { i64const } } = await instantiate(binary);
    expect((i64const as Function)()).toBe(300);
  });
});

describe("if block type inference", () => {
  test("if returning i64 value", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("if_i64", { x: Type.i32 }, function* (x) {
        const result = yield* Ctrl.if(x.gt(0))
          .then(function* () { return yield* Mem.i64(100); })
          .else(function* () { return yield* Mem.i64(0); });
        return yield* Op.wrap(result);
      });
    });
    const { exports: { if_i64 } } = await instantiate(binary);
    expect((if_i64 as Function)(1)).toBe(100);
    expect((if_i64 as Function)(0)).toBe(0);
  });

  test("if returning f64 value", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("if_f64", { x: Type.i32 }, function* (x) {
        const result = yield* Ctrl.if(x.gt(0))
          .then(function* () { return yield* Mem.f64(3.14); })
          .else(function* () { return yield* Mem.f64(0.0); });
        return yield* Op.truncI32(result);
      });
    });
    const { exports: { if_f64 } } = await instantiate(binary);
    expect((if_f64 as Function)(1)).toBe(3);
    expect((if_f64 as Function)(0)).toBe(0);
  });
});

describe("function return type inference", () => {
  test("function returning i64", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* Mem.i64(42);
      });
      // Wrap to i32 for testability
      yield* Mod.exportFunc("test", function* () {
        return yield* Op.wrap(fn());
      });
    });
    const { exports: { test: testFn } } = await instantiate(binary);
    expect((testFn as Function)()).toBe(42);
  });

  test("function returning f64", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* Mem.f64(7.5);
      });
      yield* Mod.exportFunc("test", function* () {
        return yield* Op.truncI32(fn());
      });
    });
    const { exports: { test: testFn } } = await instantiate(binary);
    expect((testFn as Function)()).toBe(7);
  });
});
