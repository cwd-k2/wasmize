import { bench, describe } from "vitest";
import { problem6_gcd_array } from "../../src/problems/gcd";
import { jsGcdArray } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * 1_000_000) + 1);

const binary = problem6_gcd_array();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
arr.forEach((v, i) => { mem[i] = v; });
const wasmGcdArray: (len: number) => number = instance.exports.array_gcd;

describe("gcd-array 10k elements", () => {
  bench("JS", () => {
    jsGcdArray(arr);
  });

  bench("Wasm", () => {
    wasmGcdArray(LEN);
  });
});
