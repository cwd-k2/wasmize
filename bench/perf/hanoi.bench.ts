import { bench, describe } from "vitest";
import { problem1_hanoi } from "../../src/problems/hanoi";
import { jsHanoi } from "../js-impls";

const N = 20;
const noop = () => {};

const binary = problem1_hanoi();
const { instance } = (await WebAssembly.instantiate(binary, {
  env: { effect_move: noop },
})) as any;
const wasmHanoi: (n: number, from: number, to: number, aux: number) => number =
  instance.exports.hanoi;

describe("hanoi n=20", () => {
  bench("JS", () => {
    jsHanoi(N, 1, 3, 2, noop);
  });

  bench("Wasm", () => {
    wasmHanoi(N, 1, 3, 2);
  });
});
