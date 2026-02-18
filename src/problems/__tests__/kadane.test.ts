import { describe, test, expect } from "vitest";
import { problem3_kadane } from "../kadane";

describe("Kadane's Algorithm", () => {
  test.each([
    { arr: [-2, 1, -3, 4, -1, 2, 1, -5, 4], expected: 6 },
    { arr: [1], expected: 1 },
    { arr: [-1, -2, -3], expected: -1 },
    { arr: [5, 4, -1, 7, 8], expected: 23 },
  ])("kadane($arr) = $expected", async ({ arr, expected }) => {
    const wasm = problem3_kadane();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const base = 1024 / 4;
    arr.forEach((v, i) => {
      mem[base + i] = v;
    });
    const kadane = instance.exports.kadane as (len: number) => number;

    expect(kadane(arr.length)).toBe(expected);
  });
});
