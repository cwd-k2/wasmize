import { bench, describe } from "vitest";
import { problem6_gcd_array } from "../../examples/problems/gcd";
import { instantiate } from "@/runtime/instantiate";
import { jsGcdArray } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * 1_000_000) + 1);

const {
  exports: { array_gcd },
  mem,
} = await instantiate(problem6_gcd_array());
arr.forEach((v, i) => {
  mem![i] = v;
});

describe("gcd-array 10k elements", () => {
  bench("JS", () => {
    jsGcdArray(arr);
  });

  bench("Wasm", () => {
    array_gcd(LEN);
  });
});
