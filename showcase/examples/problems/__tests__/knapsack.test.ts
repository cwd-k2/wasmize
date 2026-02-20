import { describe, test, expect } from "vitest";
import { problem10_knapsack } from "../knapsack";
import { instantiate } from "@/runtime/instantiate";

describe("0/1 Knapsack", () => {
  test.each([
    {
      weights: [2, 3, 4, 5],
      values: [3, 4, 5, 6],
      cap: 5,
      expected: 7, // items 0+1: weight 5, value 7
    },
    {
      weights: [1, 2, 3],
      values: [6, 10, 12],
      cap: 5,
      expected: 22, // items 1+2: weight 5, value 22
    },
    {
      weights: [10],
      values: [100],
      cap: 5,
      expected: 0, // nothing fits
    },
    {
      weights: [1, 1, 1],
      values: [10, 20, 30],
      cap: 2,
      expected: 50, // items 1+2
    },
  ])("knapsack($cap, $weights) = $expected", async ({ weights, values, cap, expected }) => {
    const {
      exports: { knapsack },
      mem,
    } = await instantiate(problem10_knapsack());

    weights.forEach((w, i) => {
      mem![i] = w;
    }); // offset 0
    values.forEach((v, i) => {
      mem![4096 / 4 + i] = v;
    }); // offset 4096

    expect(knapsack(weights.length, cap)).toBe(expected);
  });
});
