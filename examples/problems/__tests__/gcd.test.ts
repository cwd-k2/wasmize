import { describe, test, expect } from "vitest";
import { problem6_gcd_array } from "../gcd";
import { instantiate } from "@/test-helpers";

describe("GCD Array", () => {
  test.each([
    [[12, 8], 4],
    [[6], 6],
    [[12, 18, 24], 6],
    [[7, 13], 1],
    [[100, 75, 50, 25], 25],
    [[48, 36, 24, 12, 6], 6],
  ])("gcd(%j) = %i", async (arr, expected) => {
    const { exports: { array_gcd }, mem } = await instantiate(problem6_gcd_array());
    arr.forEach((v, i) => { mem![i] = v; });

    expect(array_gcd(arr.length)).toBe(expected);
  });
});
