import { describe, test, expect } from "vitest";
import { problem11_quicksort } from "../quicksort";

describe("Quicksort", () => {
  test("sorts a small array", async () => {
    const wasm = problem11_quicksort();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const quicksort = instance.exports.quicksort as (lo: number, hi: number) => number;

    const arr = [5, 3, 8, 1, 2, 7, 4, 6];
    arr.forEach((v, i) => { mem[i] = v; });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem[i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  test("already sorted", async () => {
    const wasm = problem11_quicksort();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const quicksort = instance.exports.quicksort as (lo: number, hi: number) => number;

    const arr = [1, 2, 3, 4, 5];
    arr.forEach((v, i) => { mem[i] = v; });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem[i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5]);
  });

  test("single element", async () => {
    const wasm = problem11_quicksort();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const quicksort = instance.exports.quicksort as (lo: number, hi: number) => number;

    mem[0] = 42;
    quicksort(0, 0);
    expect(mem[0]).toBe(42);
  });

  test("reverse sorted", async () => {
    const wasm = problem11_quicksort();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const quicksort = instance.exports.quicksort as (lo: number, hi: number) => number;

    const arr = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    arr.forEach((v, i) => { mem[i] = v; });

    quicksort(0, arr.length - 1);

    const sorted = Array.from({ length: arr.length }, (_, i) => mem[i]);
    expect(sorted).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
