import { bench, describe } from "vitest";
import { problem5_binary_search } from "../../src/problems/binary-search";
import { jsBinarySearch } from "../js-impls";

// Default Wasm memory = 1 page = 64KB = 16,384 i32 slots
const LEN = 10_000;
const LOOPS = 1000;
const arr = Array.from({ length: LEN }, (_, i) => i * 3);
const targets = Array.from({ length: LOOPS }, () => Math.floor(Math.random() * LEN) * 3);

const binary = problem5_binary_search();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmMemory = instance.exports.memory as WebAssembly.Memory;
const wasmMem = new Int32Array(wasmMemory.buffer);
arr.forEach((v, i) => { wasmMem[i] = v; });
const wasmSearch: (len: number, target: number) => number =
  instance.exports.binary_search;

describe("binary-search 10k × 1000", () => {
  bench("JS", () => {
    for (let i = 0; i < LOOPS; i++) jsBinarySearch(arr, targets[i]);
  });

  bench("Wasm", () => {
    for (let i = 0; i < LOOPS; i++) wasmSearch(LEN, targets[i]);
  });
});
