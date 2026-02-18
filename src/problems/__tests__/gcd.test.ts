import { describe, test, expect } from "vitest";
import { problem6_gcd_array } from "../gcd";

describe("GCD Array", () => {
  test.each([
    [[12, 8], 4],
    [[6], 6],
    [[12, 18, 24], 6],
    [[7, 13], 1],
    [[100, 75, 50, 25], 25],
    [[48, 36, 24, 12, 6], 6],
  ])("gcd(%j) = %i", async (arr, expected) => {
    const wasm = problem6_gcd_array();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    arr.forEach((v, i) => { mem[i] = v; });
    const array_gcd = instance.exports.array_gcd as (len: number) => number;

    expect(array_gcd(arr.length)).toBe(expected);
  });
});
