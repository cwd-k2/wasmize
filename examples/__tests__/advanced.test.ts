import { describe, test, expect } from "vitest";
import { structPoints } from "../advanced/struct-points";
import { stdlibSort } from "../advanced/stdlib-sort";
import { benchSieve } from "../advanced/bench-sieve";

describe("Advanced features", () => {
  describe("Struct: point Manhattan distance", () => {
    test("path through 3 points", async () => {
      const { setPoint, manhattanPath } = await structPoints();

      // (0,0) → (3,4) → (1,1)
      setPoint(0, 0, 0);
      setPoint(1, 3, 4);
      setPoint(2, 1, 1);

      // |3-0| + |4-0| = 7, |1-3| + |1-4| = 5, total = 12
      expect(manhattanPath(3)).toBe(12);
    });

    test("single point returns 0", async () => {
      const { setPoint, manhattanPath } = await structPoints();
      setPoint(0, 5, 5);
      expect(manhattanPath(1)).toBe(0);
    });

    test("two points", async () => {
      const { setPoint, manhattanPath } = await structPoints();
      setPoint(0, 0, 0);
      setPoint(1, 10, 20);

      // |10-0| + |20-0| = 30
      expect(manhattanPath(2)).toBe(30);
    });
  });

  describe("stdlib sort with comparator", () => {
    test("ascending sort", async () => {
      const { sort, mem } = await stdlibSort();

      const data = [5, 3, 8, 1, 9, 2];
      data.forEach((v, i) => { mem[i] = v; });

      sort(0, data.length - 1, 0); // cmpIdx=0: ascending

      const result = Array.from({ length: data.length }, (_, i) => mem[i]);
      expect(result).toEqual([1, 2, 3, 5, 8, 9]);
    });

    test("descending sort", async () => {
      const { sort, mem } = await stdlibSort();

      const data = [5, 3, 8, 1, 9, 2];
      data.forEach((v, i) => { mem[i] = v; });

      sort(0, data.length - 1, 1); // cmpIdx=1: descending

      const result = Array.from({ length: data.length }, (_, i) => mem[i]);
      expect(result).toEqual([9, 8, 5, 3, 2, 1]);
    });
  });

  describe("bench harness: sieve", () => {
    test("returns valid benchmark stats", async () => {
      const result = await benchSieve();

      expect(result.wasm.mean).toBeGreaterThan(0);
      expect(result.wasm.median).toBeGreaterThan(0);
      expect(result.wasm.stddev).toBeGreaterThanOrEqual(0);

      // JS baseline included
      expect(result.js).toBeDefined();
      expect(result.js!.mean).toBeGreaterThan(0);
      expect(typeof result.speedup).toBe("number");
      expect(result.speedup).toBeGreaterThan(0);
    });
  });
});
