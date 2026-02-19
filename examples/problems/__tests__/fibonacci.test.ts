import { describe, test, expect } from "vitest";
import { problem2_fib_dp } from "../fibonacci";
import { instantiate } from "@/test-helpers";

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
    const { exports: { fib } } = await instantiate(problem2_fib_dp());

    expect(fib(n)).toBe(expected);
  });
});
