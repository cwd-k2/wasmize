import { describe, test, expect } from "vitest";
import { structPoints } from "../advanced/struct-points";
import { stdlibSort } from "../advanced/stdlib-sort";
import { benchSieve } from "../advanced/bench-sieve";
import { minheapDijkstra } from "../advanced/minheap-dijkstra";
import { hashmapFrequency } from "../advanced/hashmap-frequency";

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
      data.forEach((v, i) => {
        mem[i] = v;
      });

      sort(0, data.length - 1, 0); // cmpIdx=0: ascending

      const result = Array.from({ length: data.length }, (_, i) => mem[i]);
      expect(result).toEqual([1, 2, 3, 5, 8, 9]);
    });

    test("descending sort", async () => {
      const { sort, mem } = await stdlibSort();

      const data = [5, 3, 8, 1, 9, 2];
      data.forEach((v, i) => {
        mem[i] = v;
      });

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

  describe("MinHeap Dijkstra: weighted grid shortest path", () => {
    test("3×3 uniform weight grid: (0,0)→(2,2) = 5", async () => {
      const { setWeights, dijkstra } = await minheapDijkstra();
      // 3×3 grid, all weights = 1
      // Distance includes start cell weight: 5 cells × weight 1 = 5
      setWeights([1, 1, 1, 1, 1, 1, 1, 1, 1]);
      expect(dijkstra(3, 3, 0, 0, 2, 2)).toBe(5);
    });

    test("3×3 varied weights: prefers longer but cheaper path", async () => {
      const { setWeights, dijkstra } = await minheapDijkstra();
      // Layout (weight[y*w + x]):
      //   1  100  1     y=0
      //   1  100  1     y=1
      //   1    1  1     y=2
      // Direct (0,0)→(1,0)→(2,0): 1+100+1 = 102
      // Detour (0,0)→(0,1)→(0,2)→(1,2)→(2,2)→(2,1)→(2,0): 1+1+1+1+1+1+1 = 7
      setWeights([1, 100, 1, 1, 100, 1, 1, 1, 1]);
      expect(dijkstra(3, 3, 0, 0, 2, 0)).toBe(7);
    });
  });

  describe("HashMap Frequency: count occurrences and find mode", () => {
    test("getFrequency returns correct count", async () => {
      const { setArray, countFrequencies, getFrequency } = await hashmapFrequency();
      setArray([1, 2, 2, 3, 3, 3]);
      countFrequencies(6);
      expect(getFrequency(3)).toBe(3);
      expect(getFrequency(2)).toBe(2);
      expect(getFrequency(1)).toBe(1);
    });

    test("findMode returns most frequent value", async () => {
      const { setArray, findMode } = await hashmapFrequency();
      setArray([1, 2, 2, 3, 3, 3]);
      expect(findMode(6)).toBe(3);
    });

    test("getFrequency returns 0 for absent key", async () => {
      const { setArray, countFrequencies, getFrequency } = await hashmapFrequency();
      setArray([10, 20, 20]);
      countFrequencies(3);
      expect(getFrequency(99)).toBe(0);
    });
  });
});
