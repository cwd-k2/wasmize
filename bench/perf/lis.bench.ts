import { bench, describe } from "vitest";
import { problem13_lis } from "../../examples/problems/lis";
import { instantiate } from "@/test-helpers";
import { jsLis } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * LEN));

const {
  exports: { lis },
  mem,
} = await instantiate(problem13_lis());
arr.forEach((v, i) => {
  mem![i] = v;
});

describe("lis 10k elements", () => {
  bench("JS", () => {
    jsLis(arr);
  });

  bench("Wasm", () => {
    lis(LEN);
  });
});
