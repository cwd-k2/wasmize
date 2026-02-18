import { bench, describe } from "vitest";
import { problem11_quicksort } from "../../src/problems/quicksort";
import { jsQuicksort } from "../js-impls";

const LEN = 10_000;

const binary = problem11_quicksort();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const wasmSort: (lo: number, hi: number) => number = instance.exports.quicksort;

function makeRandom(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(Math.random() * n));
}

describe("quicksort 10k elements", () => {
  bench("JS", () => {
    const arr = makeRandom(LEN);
    jsQuicksort(arr);
  });

  bench("Wasm", () => {
    const arr = makeRandom(LEN);
    const mem = new Int32Array(memory.buffer);
    arr.forEach((v, i) => { mem[i] = v; });
    wasmSort(0, LEN - 1);
  });
});
