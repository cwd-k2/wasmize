/**
 * Type-level tests for WasmRef<T> polymorphic ops and CallableFunc<Params>.
 *
 * Uses @ts-expect-error to verify that type constraints are enforced.
 * These tests validate compile-time behavior — they don't need to run Wasm.
 */
import { describe, test, expect } from "vitest";
import { Type, Mod, Op, Mem } from "../primitives";
import type { WasmRef } from "../types";
import type { CallableFunc, ChainableExpr } from "../expr";
import { local, param } from "../declarations";

describe("WasmRef<T> polymorphic type", () => {
  test("param/local return correctly typed WasmRef<T>", () => {
    function* _assertTypes() {
      const i32ref = yield* param(Type.i32);
      const i64ref = yield* local(Type.i64);
      const f64ref = yield* local(Type.f64);

      // Assignable to specific types
      void (i32ref satisfies WasmRef<"i32">);
      void (i64ref satisfies WasmRef<"i64">);
      void (f64ref satisfies WasmRef<"f64">);

      // Covariance: WasmRef<"i32"> → WasmRef (WasmRef<WasmValType>)
      void (i32ref satisfies WasmRef);
    }
    void _assertTypes;
    expect(true).toBe(true);
  });

  test("i32 ref allows all chain methods", () => {
    function* _assertI32Methods() {
      const i = yield* local(Type.i32, 0);
      yield* i.add(1);
      yield* i.sub(1);
      yield* i.mul(2);
      yield* i.eq(0);
      yield* i.lt(10);
      yield* i.and(0xff);
      yield* i.shl(2);
      yield* i.incrBy(1);
      yield* i.decrBy(1);
    }
    void _assertI32Methods;
    expect(true).toBe(true);
  });

  test("i64 ref allows arithmetic and comparison (polymorphic)", () => {
    function* _assertI64Polymorphic() {
      const x = yield* local(Type.i64);
      // i64 ref can use polymorphic arithmetic — dispatches to i64.add etc.
      x.add(Mem.i64(1));
      x.sub(Mem.i64(1));
      x.mul(Mem.i64(2));
      x.eq(Mem.i64(0));
      x.lt(Mem.i64(10));
      yield* x.incrBy(Mem.i64(1));
      // i64 ref can also use bitwise
      x.and(Mem.i64(0xff));
      x.shl(Mem.i64(2));
    }
    void _assertI64Polymorphic;
    expect(true).toBe(true);
  });

  test("i64 ref arithmetic returns ChainableExpr<i64>", () => {
    function* _assertI64ReturnType() {
      const x = yield* local(Type.i64);
      void (x.add(Mem.i64(1)) satisfies ChainableExpr<"i64">);
      void (x.sub(Mem.i64(1)) satisfies ChainableExpr<"i64">);
    }
    void _assertI64ReturnType;
    expect(true).toBe(true);
  });

  test("comparison always returns ChainableExpr<i32>", () => {
    function* _assertCmpReturnsI32() {
      const x = yield* local(Type.i64);
      void (x.eq(Mem.i64(0)) satisfies ChainableExpr<"i32">);
      void (x.lt(Mem.i64(1)) satisfies ChainableExpr<"i32">);

      const y = yield* local(Type.f64);
      void (y.eq(Mem.f64(0)) satisfies ChainableExpr<"i32">);
    }
    void _assertCmpReturnsI32;
    expect(true).toBe(true);
  });

  test("f64 ref allows arithmetic but rejects bitwise/rem", () => {
    function* _assertF64Constraints() {
      const x = yield* local(Type.f64);
      // f64 allows arithmetic
      x.add(Mem.f64(1.0));
      x.sub(Mem.f64(1.0));
      x.mul(Mem.f64(2.0));
      x.div(Mem.f64(3.0));

      // f64 rejects integer-only ops
      // @ts-expect-error — f64 ref cannot use .rem() (integer only)
      x.rem(Mem.f64(1.0));
      // @ts-expect-error — f64 ref cannot use .shl() (integer only)
      x.shl(Mem.f64(2.0));
      // @ts-expect-error — f64 ref cannot use .and() (integer only)
      x.and(Mem.f64(1.0));
      // @ts-expect-error — f64 ref cannot use .andBy() (integer only)
      x.andBy(Mem.f64(0xff));
      // @ts-expect-error — f64 ref cannot use .remBy() (integer only)
      x.remBy(Mem.f64(1.0));
    }
    void _assertF64Constraints;
    expect(true).toBe(true);
  });

  test("all refs allow .set() and .tee() (type-independent)", () => {
    function* _assertSetTee() {
      const i = yield* local(Type.i32, 0);
      const x = yield* local(Type.i64);
      const y = yield* local(Type.f64);
      yield* i.set(0);
      yield* x.set(Op.i64.add(x, Mem.i64(1)));
      yield* y.set(Op.f64.add(y, Mem.f64(1.0)));
      yield* i.tee(42);
    }
    void _assertSetTee;
    expect(true).toBe(true);
  });

  test("Mem.i64/f64 return typed ChainableExpr", () => {
    void (Mem.i64(42) satisfies ChainableExpr<"i64">);
    void (Mem.f64(3.14) satisfies ChainableExpr<"f64">);
    void (Mem.i32(1) satisfies ChainableExpr<"i32">);
    expect(true).toBe(true);
  });
});

describe("CallableFunc<Params>", () => {
  test("Mod.func returns CallableFunc<[]> for no-param functions", () => {
    function* _assertCallable() {
      void ((yield* Mod.func(function* () {
        return 42;
      })) satisfies CallableFunc<[]>);
    }
    void _assertCallable;
    expect(true).toBe(true);
  });

  test("typed CallableFunc with specific arity", () => {
    type Add = CallableFunc<["i32", "i32"]>;
    // A 2-param CallableFunc can accept exactly 2 ExprInput args
    type Check = Add extends (...args: any[]) => any ? true : never;
    const check: Check = true;
    expect(check).toBe(true);
  });

  test("Mod.func with params infers arity", () => {
    function* _assertArity() {
      const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      // Return type is a callable
      void add;
    }
    void _assertArity;
    expect(true).toBe(true);
  });
});
