import { bench, describe } from "vitest";
import { problem7_sieve } from "../../examples/problems/sieve";
import { instantiate } from "@/test-helpers";
import { jsSieve } from "../js-impls";

const N = 100_000;

const { exports: { sieve } } = await instantiate(problem7_sieve());

describe("sieve n=100000", () => {
  bench("JS", () => {
    jsSieve(N);
  });

  bench("Wasm", () => {
    sieve(N);
  });
});
