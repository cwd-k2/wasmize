import { bench, describe } from "vitest";
import { problem2_fib_dp } from "../../src/problems/fibonacci";
import { instantiate } from "../../src/test-helpers";
import { jsFib } from "../js-impls";

const N = 35;

const { exports: { fib } } = await instantiate(problem2_fib_dp());

describe("fibonacci n=35", () => {
  bench("JS", () => {
    jsFib(N);
  });

  bench("Wasm", () => {
    fib(N);
  });
});
