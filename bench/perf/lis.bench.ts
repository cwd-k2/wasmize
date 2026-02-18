import { bench, describe } from "vitest";
import { problem13_lis } from "../../src/problems/lis";
import { jsLis } from "../js-impls";

const LEN = 10_000;
const arr = Array.from({ length: LEN }, () => Math.floor(Math.random() * LEN));

const binary = problem13_lis();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
arr.forEach((v, i) => { mem[i] = v; });
const wasmLis: (len: number) => number = instance.exports.lis;

describe("lis 10k elements", () => {
  bench("JS", () => {
    jsLis(arr);
  });

  bench("Wasm", () => {
    // Re-fill since lis modifies tails area
    arr.forEach((v, i) => { mem[i] = v; });
    wasmLis(LEN);
  });
});
