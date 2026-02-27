import { describe, test, expect } from "vitest";
import { kadane } from "../declarative/kadane";
import { binarySearch } from "../declarative/binary-search";
import { arrayStats } from "../declarative/array-stats";

describe("Declarative API: wasmize()", () => {
  describe("kadane", () => {
    test.each([
      { arr: [-2, 1, -3, 4, -1, 2, 1, -5, 4], expected: 6 },
      { arr: [1], expected: 1 },
      { arr: [-1, -2, -3], expected: -1 },
      { arr: [5, 4, -1, 7, 8], expected: 23 },
    ])("kadane($arr) = $expected", async ({ arr, expected }) => {
      const mod = await kadane();
      mod.layout.arr.set(arr);
      expect(mod.exports.kadane(arr.length)).toBe(expected);
    });
  });

  describe("binary search", () => {
    test("finds existing elements", async () => {
      const mod = await binarySearch();
      const data = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
      mod.layout.data.set(data);

      expect(mod.exports.binary_search(data.length, 23)).toBe(5);
      expect(mod.exports.binary_search(data.length, 2)).toBe(0);
      expect(mod.exports.binary_search(data.length, 91)).toBe(9);
    });

    test("returns -1 for missing elements", async () => {
      const mod = await binarySearch();
      const data = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
      mod.layout.data.set(data);

      expect(mod.exports.binary_search(data.length, 50)).toBe(-1);
      expect(mod.exports.binary_search(data.length, 1)).toBe(-1);
    });
  });

  describe("array stats (multi-function)", () => {
    test("sum, max, min on same layout", async () => {
      const mod = await arrayStats();
      mod.layout.arr.set([3, 1, 4, 1, 5, 9, 2, 6]);

      expect(mod.exports.sum(8)).toBe(31);
      expect(mod.exports.max(8)).toBe(9);
      expect(mod.exports.min(8)).toBe(1);
    });

    test("single element", async () => {
      const mod = await arrayStats();
      mod.layout.arr.set([42]);

      expect(mod.exports.sum(1)).toBe(42);
      expect(mod.exports.max(1)).toBe(42);
      expect(mod.exports.min(1)).toBe(42);
    });

    test("negative values", async () => {
      const mod = await arrayStats();
      mod.layout.arr.set([-5, -3, -8, -1]);

      expect(mod.exports.sum(4)).toBe(-17);
      expect(mod.exports.max(4)).toBe(-1);
      expect(mod.exports.min(4)).toBe(-8);
    });
  });
});
