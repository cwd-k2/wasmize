import { bench, describe } from "vitest";
import { problem1_hanoi } from "../../src/problems/hanoi";
import { instantiate } from "../../src/test-helpers";
import { jsHanoi } from "../js-impls";

const N = 20;
const noop = () => {};

const { exports: { hanoi } } = await instantiate(problem1_hanoi(), {
  env: { effect_move: noop },
});

describe("hanoi n=20", () => {
  bench("JS", () => {
    jsHanoi(N, 1, 3, 2, noop);
  });

  bench("Wasm", () => {
    hanoi(N, 1, 3, 2);
  });
});
