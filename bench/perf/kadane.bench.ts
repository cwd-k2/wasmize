import { bench, describe } from "vitest";
import { problem3_kadane } from "../../examples/problems/kadane";
import { instantiate } from "@/test-helpers";
import { jsKadane } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * 200) - 100);

const { exports: { kadane }, mem } = await instantiate(problem3_kadane());
const base = 1024 / 4;
arr.forEach((v, i) => { mem![base + i] = v; });

describe("kadane 10k elements", () => {
  bench("JS", () => {
    jsKadane(arr);
  });

  bench("Wasm", () => {
    kadane(LEN);
  });
});
