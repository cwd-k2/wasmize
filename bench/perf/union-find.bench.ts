import { bench, describe } from "vitest";
import { problem15_union_find } from "../../src/problems/union-find";
import { JsUnionFind } from "../js-impls";

const N = 5_000;
const M = 20_000;
const ops = Array.from({ length: M }, () => [
  Math.floor(Math.random() * N),
  Math.floor(Math.random() * N),
]);

const binary = problem15_union_find();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmInit: (n: number) => void = instance.exports.uf_init;
const wasmUnion: (u: number, v: number) => void = instance.exports.uf_union;

describe("union-find n=5000 m=20000", () => {
  bench("JS", () => {
    const uf = new JsUnionFind(N);
    for (const [u, v] of ops) uf.union(u, v);
  });

  bench("Wasm", () => {
    wasmInit(N);
    for (const [u, v] of ops) wasmUnion(u, v);
  });
});
