import { describe, test, expect } from "vitest";
import { problem16_edit_distance } from "../edit-distance";
import { instantiate } from "@/runtime/instantiate";

describe("Edit Distance (Levenshtein)", () => {
  test.each([
    [[], [], 0],
    [[1], [], 1],
    [[], [1, 2], 2],
    [[1, 2, 3], [1, 2, 3], 0],
    [[1, 2, 3], [1, 2, 4], 1], // substitute
    [[1, 2, 3], [1, 2, 3, 4], 1], // insert
    [[1, 2, 3, 4], [1, 2, 3], 1], // delete
    [[1, 2, 3], [4, 5, 6], 3], // all different
    [[1, 3, 5, 7], [2, 4, 6, 8], 4], // all different
    [[1, 2, 3, 4, 5], [2, 3, 5], 2], // delete 1 and 4
  ])("editDistance(%j, %j) = %i", async (a, b, expected) => {
    const {
      exports: { editDistance },
      mem,
    } = await instantiate(problem16_edit_distance());

    a.forEach((v, i) => {
      mem![i] = v;
    });
    b.forEach((v, i) => {
      mem![4096 / 4 + i] = v;
    });

    expect(editDistance(a.length, b.length)).toBe(expected);
  });
});
