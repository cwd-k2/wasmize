import { describe, test, expect } from "vitest";
import { problem14_nqueens } from "../nqueens";

describe("N-Queens Count", () => {
  test.each([
    [1, 1],
    [4, 2],
    [5, 10],
    [8, 92],
    [10, 724],
    [12, 14200],
  ])("nqueens(%i) = %i", async (n, expected) => {
    const wasm = problem14_nqueens();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const nqueens = instance.exports.nqueens as (n: number) => number;

    expect(nqueens(n)).toBe(expected);
  });
});
