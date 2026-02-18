import { bench, describe } from "vitest";
import { problem14_nqueens } from "../../src/problems/nqueens";
import { jsNqueens } from "../js-impls";

const binary = problem14_nqueens();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmNqueens: (n: number) => number = instance.exports.nqueens;

describe("nqueens n=12", () => {
  bench("JS", () => {
    jsNqueens(12);
  });

  bench("Wasm", () => {
    wasmNqueens(12);
  });
});
