import { bench, describe } from "vitest";
import { problem7_sieve } from "../../src/problems/sieve";
import { jsSieve } from "../js-impls";

const N = 100_000;

const binary = problem7_sieve();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmSieve: (n: number) => number = instance.exports.sieve;

describe("sieve n=100000", () => {
  bench("JS", () => {
    jsSieve(N);
  });

  bench("Wasm", () => {
    wasmSieve(N);
  });
});
