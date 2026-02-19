import { describe, test, expect } from "vitest";
import { problem14_nqueens } from "../nqueens";
import { instantiate } from "@/test-helpers";

describe("N-Queens Count", () => {
  test.each([
    [1, 1],
    [4, 2],
    [5, 10],
    [8, 92],
    [10, 724],
    [12, 14200],
  ])("nqueens(%i) = %i", async (n, expected) => {
    const { exports: { nqueens } } = await instantiate(problem14_nqueens());

    expect(nqueens(n)).toBe(expected);
  });
});
