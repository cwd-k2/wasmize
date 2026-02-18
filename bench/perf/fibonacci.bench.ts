import { bench, describe } from "vitest";
import { problem2_fib_dp } from "../../src/problems/fibonacci";
import { jsFib } from "../js-impls";

const N = 35;

const binary = problem2_fib_dp();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmFib: (n: number) => number = instance.exports.fib;

describe("fibonacci n=35", () => {
  bench("JS", () => {
    jsFib(N);
  });

  bench("Wasm", () => {
    wasmFib(N);
  });
});
