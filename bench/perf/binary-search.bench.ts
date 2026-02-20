import { bench, describe } from "vitest";
import { problem5_binary_search } from "../../examples/problems/binary-search";
import { instantiate } from "@/test-helpers";
import { jsBinarySearch } from "../js-impls";

const LEN = 10_000;
const LOOPS = 1000;
const arr = Array.from({ length: LEN }, (_, i) => i * 3);
const targets = Array.from({ length: LOOPS }, () => Math.floor(Math.random() * LEN) * 3);

const {
  exports: { search_batch },
  mem,
} = await instantiate(problem5_binary_search());
arr.forEach((v, i) => {
  mem![i] = v;
});

// Store targets after the sorted array for batch Wasm search
const TBASE = LEN;
targets.forEach((v, i) => {
  mem![TBASE + i] = v;
});

describe("binary-search 10k × 1000", () => {
  bench("JS", () => {
    for (let i = 0; i < LOOPS; i++) jsBinarySearch(arr, targets[i]);
  });

  bench("Wasm", () => {
    search_batch(LEN, TBASE * 4, LOOPS);
  });
});
