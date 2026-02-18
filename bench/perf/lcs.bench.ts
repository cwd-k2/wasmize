import { bench, describe } from "vitest";
import { problem9_lcs } from "../../src/problems/lcs";
import { jsLcs } from "../js-impls";

const N = 256;
const a = Array.from({ length: N }, () => Math.floor(Math.random() * 26));
const b = Array.from({ length: N }, () => Math.floor(Math.random() * 26));

const binary = problem9_lcs();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
a.forEach((v, i) => { mem[i] = v; });
b.forEach((v, i) => { mem[1024 / 4 + i] = v; });
const wasmLcs: (la: number, lb: number) => number = instance.exports.lcs;

describe("lcs 256x256", () => {
  bench("JS", () => {
    jsLcs(a, b);
  });

  bench("Wasm", () => {
    wasmLcs(N, N);
  });
});
