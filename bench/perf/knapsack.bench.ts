import { bench, describe } from "vitest";
import { problem10_knapsack } from "../../examples/problems/knapsack";
import { instantiate } from "@/test-helpers";
import { jsKnapsack } from "../js-impls";

const N = 200;
const CAP = 1000;
const weights = Array.from({ length: N }, () => Math.floor(Math.random() * 50) + 1);
const values = Array.from({ length: N }, () => Math.floor(Math.random() * 100) + 1);

const { exports: { knapsack }, mem } = await instantiate(problem10_knapsack());
weights.forEach((w, i) => { mem![i] = w; });
values.forEach((v, i) => { mem![4096 / 4 + i] = v; });

describe("knapsack n=200 W=1000", () => {
  bench("JS", () => {
    jsKnapsack(weights, values, CAP);
  });

  bench("Wasm", () => {
    knapsack(N, CAP);
  });
});
