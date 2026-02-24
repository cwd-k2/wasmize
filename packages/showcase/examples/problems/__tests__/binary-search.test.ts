import { describe, test, expect } from "vitest";
import { problem5_binary_search } from "../binary-search";
import { instantiate } from "wasmize/runtime/instantiate";

describe("Binary Search", () => {
  const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];

  test.each([
    { target: 23, expected: 5 },
    { target: 2, expected: 0 },
    { target: 91, expected: 9 },
    { target: 50, expected: -1 },
    { target: 12, expected: 3 },
  ])("search($target) = $expected", async ({ target, expected }) => {
    const {
      exports: { binary_search },
      mem,
    } = await instantiate(problem5_binary_search());
    arr.forEach((v, i) => {
      mem![i] = v;
    });

    expect(binary_search(arr.length, target)).toBe(expected);
  });
});
