import { describe, test, expect } from "vitest";
import { problem11_quicksort } from "../quicksort";
import { instantiate } from "@/runtime/instantiate";

describe("Quicksort", () => {
  test("sorts a small array", async () => {
    const {
      exports: { quicksort },
      mem,
    } = await instantiate(problem11_quicksort());

    const arr = [5, 3, 8, 1, 2, 7, 4, 6];
    arr.forEach((v, i) => {
      mem![i] = v;
    });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem![i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("already sorted", async () => {
    const {
      exports: { quicksort },
      mem,
    } = await instantiate(problem11_quicksort());

    const arr = [1, 2, 3, 4, 5];
    arr.forEach((v, i) => {
      mem![i] = v;
    });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem![i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });

  test("single element", async () => {
    const {
      exports: { quicksort },
      mem,
    } = await instantiate(problem11_quicksort());

    mem![0] = 42;
    quicksort(0, 0);
    expect(mem![0]).toBe(42);
  });

  test("reverse sorted", async () => {
    const {
      exports: { quicksort },
      mem,
    } = await instantiate(problem11_quicksort());

    const arr = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    arr.forEach((v, i) => {
      mem![i] = v;
    });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem![i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
