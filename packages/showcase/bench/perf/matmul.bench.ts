import { bench, describe } from "vitest";
import { problem8_matmul } from "../../examples/problems/matmul";
import { instantiate } from "wasmize/runtime/instantiate";
import { jsMatmul } from "../js-impls";

const N = 64;
const nn = N * N;
const A = Array.from({ length: nn }, () => Math.floor(Math.random() * 100));
const B = Array.from({ length: nn }, () => Math.floor(Math.random() * 100));

const {
  exports: { matmul },
  mem,
} = await instantiate(problem8_matmul());
A.forEach((v, i) => {
  mem![i] = v;
});
B.forEach((v, i) => {
  mem![nn + i] = v;
});

describe("matmul 64x64", () => {
  bench("JS", () => {
    jsMatmul(A, B, N);
  });

  bench("Wasm", () => {
    matmul(N);
  });
});
