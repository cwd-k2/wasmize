import { bench, describe } from "vitest";
import { problem11_quicksort } from "../../src/problems/quicksort";
import { instantiate } from "../../src/test-helpers";
import { jsQuicksort } from "../js-impls";

const LEN = 10_000;

const { exports: { quicksort }, mem } = await instantiate(problem11_quicksort());

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
    arr.forEach((v, i) => { mem![i] = v; });
    quicksort(0, LEN - 1);
  });
});
