import { bench, describe } from "vitest";
import { problem8_matmul } from "../../src/problems/matmul";
import { jsMatmul } from "../js-impls";

const N = 64;
const nn = N * N;
const A = Array.from({ length: nn }, () => Math.floor(Math.random() * 100));
const B = Array.from({ length: nn }, () => Math.floor(Math.random() * 100));

const binary = problem8_matmul();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const mem = new Int32Array(memory.buffer);
A.forEach((v, i) => { mem[i] = v; });
B.forEach((v, i) => { mem[nn + i] = v; });
const wasmMatmul: (n: number) => number = instance.exports.matmul;

describe("matmul 64x64", () => {
  bench("JS", () => {
    jsMatmul(A, B, N);
  });

  bench("Wasm", () => {
    wasmMatmul(N);
  });
});
