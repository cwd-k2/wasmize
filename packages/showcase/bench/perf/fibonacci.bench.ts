import { bench, describe } from "vitest";
import { problem2_fib_dp } from "../../examples/problems/fibonacci";
import { instantiate } from "wasmize/runtime/instantiate";
import { jsFib } from "../js-impls";

const N = 35;

const {
  exports: { fib },
} = await instantiate(problem2_fib_dp());

describe("fibonacci n=35", () => {
  bench("JS", () => {
    jsFib(N);
  });

  bench("Wasm", () => {
    fib(N);
  });
});
