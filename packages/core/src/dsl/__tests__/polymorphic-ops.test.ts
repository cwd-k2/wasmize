/**
 * Runtime tests for polymorphic WasmRef operations.
 *
 * Verifies that i64/f64 ref methods dispatch to the correct typed Wasm instructions.
 */
import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Mem, f64, i32 } from "../primitives";
import { instantiate } from "../../runtime/instantiate";

describe("polymorphic i64 ref ops", () => {
  test("i64 ref .add() dispatches to i64.add", async () => {
    const binary = compile<{ add64: (a: bigint, b: bigint) => bigint }>(function* () {
      yield* Mod.exportFunc("add64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
        return yield* a.add(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.add64(10n, 20n)).toBe(30n);
    expect(exports.add64(0x7fffffffffffffffn, 1n)).toBe(-0x8000000000000000n);
  });

  test("i64 ref .sub() and .mul()", async () => {
    const binary = compile<{
      sub64: (a: bigint, b: bigint) => bigint;
      mul64: (a: bigint, b: bigint) => bigint;
    }>(function* () {
      yield* Mod.exportFunc("sub64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
        return yield* a.sub(b);
      });
      yield* Mod.exportFunc("mul64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
        return yield* a.mul(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.sub64(100n, 30n)).toBe(70n);
    expect(exports.mul64(6n, 7n)).toBe(42n);
  });

  test("i64 ref .eq() returns i32 (comparison always produces i32)", async () => {
    const binary = compile<{ eq64: (a: bigint, b: bigint) => number }>(function* () {
      yield* Mod.exportFunc("eq64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
        return yield* a.eq(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.eq64(42n, 42n)).toBe(1);
    expect(exports.eq64(42n, 43n)).toBe(0);
  });

  test("i64 ref .incrBy() dispatches to i64.add in-place", async () => {
    const binary = compile<{ incr: (x: bigint) => bigint }>(function* () {
      yield* Mod.exportFunc("incr", { x: Type.i64 }, function* (x) {
        yield* x.incrBy(Mem.i64(10));
        return x;
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.incr(5n)).toBe(15n);
  });

  test("i64 ref .and() dispatches to i64.and", async () => {
    const binary = compile<{ and64: (a: bigint, b: bigint) => bigint }>(function* () {
      yield* Mod.exportFunc("and64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
        return yield* a.and(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.and64(0xffn, 0x0fn)).toBe(0x0fn);
  });
});

describe("polymorphic f64 ref ops", () => {
  test("f64 ref .add() and .mul() dispatch to f64 ops", async () => {
    const binary = compile<{
      add_f64: (a: number, b: number) => number;
      mul_f64: (a: number, b: number) => number;
    }>(function* () {
      yield* Mod.exportFunc("add_f64", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* a.add(b);
      });
      yield* Mod.exportFunc("mul_f64", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* a.mul(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.add_f64(1.5, 2.5)).toBe(4.0);
    expect(exports.mul_f64(3.0, 2.5)).toBe(7.5);
  });

  test("f64 ref .eq() returns i32", async () => {
    const binary = compile<{ eq_f64: (a: number, b: number) => number }>(function* () {
      yield* Mod.exportFunc("eq_f64", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* a.eq(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.eq_f64(3.14, 3.14)).toBe(1);
    expect(exports.eq_f64(3.14, 2.71)).toBe(0);
  });
});

describe("ChainableExpr<T> type propagation", () => {
  test("i64 ChainableExpr chains preserve i64 type", async () => {
    const binary = compile<{ chain: (a: bigint, b: bigint, c: bigint) => bigint }>(function* () {
      yield* Mod.exportFunc(
        "chain",
        { a: Type.i64, b: Type.i64, c: Type.i64 },
        function* (a, b, c) {
          // a.add(b).mul(c) — all i64 ops
          return yield* a.add(b).mul(c);
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect(exports.chain(2n, 3n, 4n)).toBe(20n); // (2+3)*4
  });

  test("f64 ChainableExpr chains preserve f64 type", async () => {
    const binary = compile<{ chain: (a: number, b: number, c: number) => number }>(function* () {
      yield* Mod.exportFunc(
        "chain",
        { a: Type.f64, b: Type.f64, c: Type.f64 },
        function* (a, b, c) {
          return yield* a.add(b).mul(c);
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect(exports.chain(1.5, 2.5, 3.0)).toBe(12.0); // (1.5+2.5)*3
  });
});

describe("ChainableExpr unary methods", () => {
  test(".neg() on f64", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.neg();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(3.14)).toBeCloseTo(-3.14);
    expect(exports.run(-2.5)).toBeCloseTo(2.5);
  });

  test(".abs() on f64", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.abs();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(-7.5)).toBeCloseTo(7.5);
    expect(exports.run(3.0)).toBeCloseTo(3.0);
  });

  test(".sqrt() on f64", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.sqrt();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(9.0)).toBeCloseTo(3.0);
    expect(exports.run(2.0)).toBeCloseTo(Math.SQRT2);
  });

  test(".clz() on i32", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.clz();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(1)).toBe(31);
    expect(exports.run(0x80000000)).toBe(0);
  });

  test(".eqz()", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.eqz();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(0)).toBe(1);
    expect(exports.run(42)).toBe(0);
  });
});

describe("WasmRef unary methods", () => {
  test("f64 ref .neg()", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.neg();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(5.0)).toBeCloseTo(-5.0);
  });

  test("i32 ref .eqz()", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.eqz();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(0)).toBe(1);
    expect(exports.run(1)).toBe(0);
  });

  test("i32 ref .clz()", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.clz();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(1)).toBe(31);
  });
});

describe("conversion methods", () => {
  test(".toF64() from i32", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.toF64();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(42)).toBe(42.0);
  });

  test(".toI32() from f64", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.toI32();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(3.99)).toBe(3);
    expect(exports.run(-2.7)).toBe(-2);
  });

  test(".toI64() from i32", async () => {
    const binary = compile<{ run: (x: number) => bigint }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        return yield* x.toI64();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(42)).toBe(42n);
    expect(exports.run(-1)).toBe(-1n);
  });

  test("ChainableExpr .toF64() from i32 constant", async () => {
    const binary = compile<{ run: () => number }>(function* () {
      yield* Mod.exportFunc("run", function* () {
        return yield* i32(42).toF64();
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run()).toBe(42.0);
  });
});

describe(".clamp()", () => {
  test("i32 clamp", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.i32 }, function* (x) {
        // x.add(0) converts WasmRef → ChainableExpr to access .clamp()
        return yield* x.add(0).clamp(10, 20);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(5)).toBe(10);
    expect(exports.run(15)).toBe(15);
    expect(exports.run(25)).toBe(20);
  });

  test("f64 clamp", async () => {
    const binary = compile<{ run: (x: number) => number }>(function* () {
      yield* Mod.exportFunc("run", { x: Type.f64 }, function* (x) {
        return yield* x.add(f64(0.0)).clamp(f64(0.0), f64(1.0));
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.run(-0.5)).toBeCloseTo(0.0);
    expect(exports.run(0.5)).toBeCloseTo(0.5);
    expect(exports.run(1.5)).toBeCloseTo(1.0);
  });
});
