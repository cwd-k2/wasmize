import { describe, test, expect } from "vitest";
import { fibonacci } from "../inline/fibonacci";
import { gcd } from "../inline/gcd";

describe("Inline API: wasmFunc()", () => {
  describe("fibonacci", () => {
    test.each([
      [0, 0],
      [1, 1],
      [2, 1],
      [5, 5],
      [10, 55],
      [20, 6765],
      [30, 832040],
    ])("fib(%i) = %i", async (n, expected) => {
      const fib = await fibonacci();
      expect(fib(n)).toBe(expected);
    });
  });

  describe("gcd", () => {
    test.each([
      [12, 8, 4],
      [100, 75, 25],
      [17, 13, 1],
      [0, 5, 5],
      [48, 18, 6],
    ])("gcd(%i, %i) = %i", async (a, b, expected) => {
      const g = await gcd();
      expect(g(a, b)).toBe(expected);
    });
  });
});
