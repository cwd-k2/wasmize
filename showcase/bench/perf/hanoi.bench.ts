import { bench, describe } from "vitest";
import { problem1_hanoi } from "../../examples/problems/hanoi";
import { instantiate } from "@/runtime/instantiate";
import { jsHanoi } from "../js-impls";

const N = 20;

const {
  exports: { hanoi },
} = await instantiate(problem1_hanoi());

describe("hanoi n=20", () => {
  bench("JS", () => {
    jsHanoi(N, 1, 3, 2);
  });

  bench("Wasm", () => {
    hanoi(N, 1, 3, 2);
  });
});
