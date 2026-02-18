import { describe, test, expect } from "vitest";
import { problem13_lis } from "../lis";

describe("LIS (Longest Increasing Subsequence)", () => {
  test.each([
    [[10, 9, 2, 5, 3, 7, 101, 18], 4],  // 2,3,7,18 or 2,3,7,101
    [[0, 1, 0, 3, 2, 3], 4],              // 0,1,2,3
    [[7, 7, 7, 7], 1],
    [[1, 2, 3, 4, 5], 5],
    [[5, 4, 3, 2, 1], 1],
    [[3, 1, 4, 1, 5, 9, 2, 6], 4],        // 1,4,5,9 or 1,4,5,6
  ])("lis(%j) = %i", async (arr, expected) => {
    const wasm = problem13_lis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const lis = instance.exports.lis as (len: number) => number;

    arr.forEach((v, i) => { mem[i] = v; });

    expect(lis(arr.length)).toBe(expected);
  });
});
