import { bench, describe } from "vitest";
import { problem11_quicksort } from "../../examples/problems/quicksort";
import { instantiate } from "@/test-helpers";
import { jsQuicksort } from "../js-impls";

const LEN = 10_000;

const {
  exports: { quicksort },
  mem,
} = await instantiate(problem11_quicksort());

function makeRandom(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(Math.random() * n));
}

describe("quicksort 10k elements", () => {
  bench("JS", () => {
    const arr = makeRandom(LEN);
    jsQuicksort(arr);
  });

  bench("Wasm", () => {
    mem!.set(makeRandom(LEN));
    quicksort(0, LEN - 1);
  });
});
