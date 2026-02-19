import { describe, test, expect } from "vitest";
import { problem3_kadane } from "../kadane";
import { instantiate } from "@/test-helpers";

describe("Kadane's Algorithm", () => {
  test.each([
    { arr: [-2, 1, -3, 4, -1, 2, 1, -5, 4], expected: 6 },
    { arr: [1], expected: 1 },
    { arr: [-1, -2, -3], expected: -1 },
    { arr: [5, 4, -1, 7, 8], expected: 23 },
  ])("kadane($arr) = $expected", async ({ arr, expected }) => {
    const { exports: { kadane }, mem } = await instantiate(problem3_kadane());
    const base = 1024 / 4;
    arr.forEach((v, i) => { mem![base + i] = v; });

    expect(kadane(arr.length)).toBe(expected);
  });
});
