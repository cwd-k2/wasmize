import { describe, test, expect } from "vitest";
import { problem9_lcs } from "../lcs";

describe("LCS Length", () => {
  test.each([
    [
      [1, 2, 3, 4, 5],
      [2, 4, 5],
      3,
    ],
    [
      [1, 3, 4, 1],
      [1, 3, 1, 4],
      3,
    ],
    [[1], [1], 1],
    [[1], [2], 0],
    [[], [1, 2], 0],
    [
      [1, 2, 3],
      [1, 2, 3],
      3,
    ],
  ])("lcs(%j, %j) = %i", async (a, b, expected) => {
    const wasm = problem9_lcs();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const lcs = instance.exports.lcs as (la: number, lb: number) => number;

    // A at offset 0, B at offset 1024
    a.forEach((v, i) => { mem[i] = v; });
    b.forEach((v, i) => { mem[1024 / 4 + i] = v; });

    expect(lcs(a.length, b.length)).toBe(expected);
  });
});
