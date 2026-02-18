import { bench, describe } from "vitest";
import { problem3_kadane } from "../../src/problems/kadane";
import { jsKadane } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * 200) - 100);

const binary = problem3_kadane();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
const base = 1024 / 4;
arr.forEach((v, i) => { mem[base + i] = v; });
const wasmKadane: (len: number) => number = instance.exports.kadane;

describe("kadane 10k elements", () => {
  bench("JS", () => {
    jsKadane(arr);
  });

  bench("Wasm", () => {
    wasmKadane(LEN);
  });
});
