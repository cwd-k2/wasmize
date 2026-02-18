import { describe, test, expect } from "vitest";
import { problem2_fib_dp } from "../fibonacci";

describe("Fibonacci DP", () => {
  test.each([
    [0, 0],
    [1, 1],
    [2, 1],
    [5, 5],
    [10, 55],
    [20, 6765],
    [30, 832040],
  ])("fib(%i) = %i", async (n, expected) => {
    const wasm = problem2_fib_dp();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const fib = instance.exports.fib as (n: number) => number;

    expect(fib(n)).toBe(expected);
  });
});
