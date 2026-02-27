import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod, Ctrl } from "../dsl/primitives";
import { instantiate } from "../runtime/instantiate";

describe("V-04: Type mismatch detection (binop/cmp)", () => {
  // --- WasmRef: i32 + i64 ---
  test("WasmRef i32.add(i64 ref) throws type mismatch", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i32, b: Type.i64 }, function* (a, b) {
          return yield* a.add(b);
        });
      }),
    ).toThrow("Type mismatch: cannot add i32 and i64");
  });

  // --- WasmRef: i64 + i32 ---
  test("WasmRef i64.add(i32 ref) throws type mismatch", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i64, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
      }),
    ).toThrow("Type mismatch: cannot add i64 and i32");
  });

  // --- WasmRef: f64 + i32 ---
  test("WasmRef f64.sub(i32 ref) throws type mismatch", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.f64, b: Type.i32 }, function* (a, b) {
          return yield* a.sub(b);
        });
      }),
    ).toThrow("Type mismatch: cannot sub f64 and i32");
  });

  // --- WasmRef comparison: i32.lt(i64) ---
  test("WasmRef i32.lt(i64 ref) throws type mismatch", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i32, b: Type.i64 }, function* (a, b) {
          yield* Ctrl.when(a.lt(b), function* () {});
        });
      }),
    ).toThrow("Type mismatch: cannot lt i32 and i64");
  });

  // --- WasmRef: same type operations pass normally ---
  test("WasmRef i32.add(i32 ref) passes", async () => {
    const binary = compile<{ f(a: number, b: number): number }>(function* () {
      yield* Mod.exportFunc("f", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.f(3, 4)).toBe(7);
  });

  test("WasmRef i64 same-type operations pass", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i64, b: Type.i64 }, function* (a, b) {
          return yield* a.add(b);
        });
      }),
    ).not.toThrow();
  });

  // --- Number literal (implicitly typed) passes ---
  test("WasmRef i32.add(number literal) passes", async () => {
    const binary = compile<{ f(a: number): number }>(function* () {
      yield* Mod.exportFunc("f", { a: Type.i32 }, function* (a) {
        return yield* a.add(1);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.f(10)).toBe(11);
  });

  test("WasmRef i64.mul(number literal) passes", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i64 }, function* (a) {
          return yield* a.mul(2);
        });
      }),
    ).not.toThrow();
  });

  // --- ChainableExpr type mismatch ---
  test("ChainableExpr i64 chain .add(i32 ref) throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i64, b: Type.i32 }, function* (a, b) {
          return yield* a.add(1).add(b);
        });
      }),
    ).toThrow("Type mismatch: cannot add i64 and i32");
  });

  // --- ChainableExpr same type passes ---
  test("ChainableExpr i32 chain .add(i32 ref) passes", async () => {
    const binary = compile<{ f(a: number, b: number): number }>(function* () {
      yield* Mod.exportFunc("f", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(1).add(b);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.f(3, 4)).toBe(8);
  });

  // --- In-place mutation: incrBy with mismatch ---
  test("WasmRef i32.incrBy(i64 ref) throws type mismatch", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i32, b: Type.i64 }, function* (a, b) {
          yield* a.incrBy(b);
        });
      }),
    ).toThrow("Type mismatch: cannot add i32 and i64");
  });

  // --- Error message suggests correct conversion ---
  test("error message suggests conversion to self type", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("f", { a: Type.i64, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
      }),
    ).toThrow(".toI64()");
  });
});
