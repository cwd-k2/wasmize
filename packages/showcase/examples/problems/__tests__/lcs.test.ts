import { describe, test, expect } from "vitest";
import { problem9_lcs } from "../lcs";
import { instantiate } from "wasmize/runtime/instantiate";

describe("LCS Length", () => {
  test.each([
    [[1, 2, 3, 4, 5], [2, 4, 5], 3],
    [[1, 3, 4, 1], [1, 3, 1, 4], 3],
    [[1], [1], 1],
    [[1], [2], 0],
    [[], [1, 2], 0],
    [[1, 2, 3], [1, 2, 3], 3],
  ])("lcs(%j, %j) = %i", async (a, b, expected) => {
    const {
      exports: { lcs },
      mem,
    } = await instantiate(problem9_lcs());

    // A at offset 0, B at offset 1024
    a.forEach((v, i) => {
      mem![i] = v;
    });
    b.forEach((v, i) => {
      mem![1024 / 4 + i] = v;
    });

    expect(lcs(a.length, b.length)).toBe(expected);
  });
});
