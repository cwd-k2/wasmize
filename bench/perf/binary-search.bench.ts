import { bench, describe } from "vitest";
import { problem5_binary_search } from "../../src/problems/binary-search";
import { instantiate } from "../../src/test-helpers";
import { jsBinarySearch } from "../js-impls";

// Default Wasm memory = 1 page = 64KB = 16,384 i32 slots
const LEN = 10_000;
const LOOPS = 1000;
const arr = Array.from({ length: LEN }, (_, i) => i * 3);
const targets = Array.from({ length: LOOPS }, () => Math.floor(Math.random() * LEN) * 3);

const { exports: { binary_search }, mem } = await instantiate(problem5_binary_search());
arr.forEach((v, i) => { mem![i] = v; });

describe("binary-search 10k × 1000", () => {
  bench("JS", () => {
    for (let i = 0; i < LOOPS; i++) jsBinarySearch(arr, targets[i]);
  });

  bench("Wasm", () => {
    for (let i = 0; i < LOOPS; i++) binary_search(LEN, targets[i]);
  });
});
