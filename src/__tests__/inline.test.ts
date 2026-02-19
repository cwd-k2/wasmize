import { describe, test, expect } from "vitest";
import { wasmFunc } from "../inline";
import { Op } from "../dsl/primitives";

describe("wasmFunc", () => {
  test("scalar parameters", async () => {
    const add = await wasmFunc(
      { a: "i32", b: "i32" },
      "i32",
      function* (a, b) {
        return yield* a.add(b);
      },
    );
    expect(add(3, 4)).toBe(7);
    expect(add(10, -3)).toBe(7);
  });

  test("single parameter", async () => {
    const double = await wasmFunc(
      { n: "i32" },
      "i32",
      function* (n) {
        return yield* n.mul(2);
      },
    );
    expect(double(21)).toBe(42);
  });

  test("void result", async () => {
    const noop = await wasmFunc(
      { n: "i32" },
      "void",
      function* () {},
    );
    expect(noop(0)).toBeUndefined();
  });

  test("f64 result via conversion", async () => {
    const toF64 = await wasmFunc(
      { n: "i32" },
      "f64",
      function* (n) {
        return yield* Op.toF64(n);
      },
    );
    expect(toF64(10)).toBe(10.0);
  });

  test("multiple calls reuse cached instance", async () => {
    const body = function* (a: any, b: any) {
      return yield* a.add(b);
    };
    const fn1 = await wasmFunc({ a: "i32", b: "i32" }, "i32", body);
    const fn2 = await wasmFunc({ a: "i32", b: "i32" }, "i32", body);
    expect(fn1(1, 2)).toBe(3);
    expect(fn2(3, 4)).toBe(7);
  });
});
