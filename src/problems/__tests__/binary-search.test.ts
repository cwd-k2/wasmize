import { describe, test, expect } from "vitest";
import { problem5_binary_search } from "../binary-search";

describe("Binary Search", () => {
  const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];

  test.each([
    { target: 23, expected: 5 },
    { target: 2, expected: 0 },
    { target: 91, expected: 9 },
    { target: 50, expected: -1 },
    { target: 12, expected: 3 },
  ])("search($target) = $expected", async ({ target, expected }) => {
    const wasm = problem5_binary_search();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);

    arr.forEach((v, i) => {
      mem[i] = v;
    });

    const binary_search = instance.exports.binary_search as (
      len: number,
      target: number,
    ) => number;

    expect(binary_search(arr.length, target)).toBe(expected);
  });
});
