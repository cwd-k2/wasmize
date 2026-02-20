import { describe, test, expect } from "vitest";
import { problem13_lis } from "../lis";
import { instantiate } from "@/runtime/instantiate";

describe("LIS (Longest Increasing Subsequence)", () => {
  test.each([
    [[10, 9, 2, 5, 3, 7, 101, 18], 4], // 2,3,7,18 or 2,3,7,101
    [[0, 1, 0, 3, 2, 3], 4], // 0,1,2,3
    [[7, 7, 7, 7], 1],
    [[1, 2, 3, 4, 5], 5],
    [[5, 4, 3, 2, 1], 1],
    [[3, 1, 4, 1, 5, 9, 2, 6], 4], // 1,4,5,9 or 1,4,5,6
  ])("lis(%j) = %i", async (arr, expected) => {
    const {
      exports: { lis },
      mem,
    } = await instantiate(problem13_lis());

    arr.forEach((v, i) => {
      mem![i] = v;
    });

    expect(lis(arr.length)).toBe(expected);
  });
});
