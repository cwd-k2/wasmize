/**
 * Runtime tests for polymorphic WasmRef operations.
 *
 * Verifies that i64/f64 ref methods dispatch to the correct typed Wasm instructions.
 */
import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Mem } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("polymorphic i64 ref ops", () => {
  test("i64 ref .add() dispatches to i64.add", async () => {
    const binary = compile<{ add64: (a: bigint, b: bigint) => bigint }>(
      function* () {
        yield* Mod.exportFunc("add64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
          return yield* a.add(b);
        });
      },
    );
    const { exports } = await instantiate(binary);
    expect(exports.add64(10n, 20n)).toBe(30n);
    expect(exports.add64(0x7FFFFFFFFFFFFFFFn, 1n)).toBe(-0x8000000000000000n);
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
    const binary = compile<{ eq64: (a: bigint, b: bigint) => number }>(
      function* () {
        yield* Mod.exportFunc("eq64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
          return yield* a.eq(b);
        });
      },
    );
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
    const binary = compile<{ and64: (a: bigint, b: bigint) => bigint }>(
      function* () {
        yield* Mod.exportFunc("and64", { a: Type.i64, b: Type.i64 }, function* (a, b) {
          return yield* a.and(b);
        });
      },
    );
    const { exports } = await instantiate(binary);
    expect(exports.and64(0xFFn, 0x0Fn)).toBe(0x0Fn);
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
    const binary = compile<{ eq_f64: (a: number, b: number) => number }>(
      function* () {
        yield* Mod.exportFunc("eq_f64", { a: Type.f64, b: Type.f64 }, function* (a, b) {
          return yield* a.eq(b);
        });
      },
    );
    const { exports } = await instantiate(binary);
    expect(exports.eq_f64(3.14, 3.14)).toBe(1);
    expect(exports.eq_f64(3.14, 2.71)).toBe(0);
  });
});

describe("ChainableExpr<T> type propagation", () => {
  test("i64 ChainableExpr chains preserve i64 type", async () => {
    const binary = compile<{ chain: (a: bigint, b: bigint, c: bigint) => bigint }>(
      function* () {
        yield* Mod.exportFunc(
          "chain",
          { a: Type.i64, b: Type.i64, c: Type.i64 },
          function* (a, b, c) {
            // a.add(b).mul(c) — all i64 ops
            return yield* a.add(b).mul(c);
          },
        );
      },
    );
    const { exports } = await instantiate(binary);
    expect(exports.chain(2n, 3n, 4n)).toBe(20n); // (2+3)*4
  });

  test("f64 ChainableExpr chains preserve f64 type", async () => {
    const binary = compile<{ chain: (a: number, b: number, c: number) => number }>(
      function* () {
        yield* Mod.exportFunc(
          "chain",
          { a: Type.f64, b: Type.f64, c: Type.f64 },
          function* (a, b, c) {
            return yield* a.add(b).mul(c);
          },
        );
      },
    );
    const { exports } = await instantiate(binary);
    expect(exports.chain(1.5, 2.5, 3.0)).toBe(12.0); // (1.5+2.5)*3
  });
});
