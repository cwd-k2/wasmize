import { bench, describe } from "vitest";
import { problem10_knapsack } from "../../src/problems/knapsack";
import { jsKnapsack } from "../js-impls";

const N = 200;
const CAP = 1000;
const weights = Array.from({ length: N }, () => Math.floor(Math.random() * 50) + 1);
const values = Array.from({ length: N }, () => Math.floor(Math.random() * 100) + 1);

const binary = problem10_knapsack();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
weights.forEach((w, i) => { mem[i] = w; });
values.forEach((v, i) => { mem[4096 / 4 + i] = v; });
const wasmKnapsack: (n: number, W: number) => number = instance.exports.knapsack;

describe("knapsack n=200 W=1000", () => {
  bench("JS", () => {
    jsKnapsack(weights, values, CAP);
  });

  bench("Wasm", () => {
    wasmKnapsack(N, CAP);
  });
});
