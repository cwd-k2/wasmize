import { bench, describe } from "vitest";
import { problem15_union_find } from "../../examples/problems/union-find";
import { instantiate } from "@/test-helpers";
import { JsUnionFind } from "../js-impls";

const N = 5_000;
const M = 20_000;
const ops = Array.from({ length: M }, () => [
  Math.floor(Math.random() * N),
  Math.floor(Math.random() * N),
]);

const { exports: { uf_init, uf_union } } = await instantiate(problem15_union_find());

describe("union-find n=5000 m=20000", () => {
  bench("JS", () => {
    const uf = new JsUnionFind(N);
    for (const [u, v] of ops) uf.union(u, v);
  });

  bench("Wasm", () => {
    uf_init(N);
    for (const [u, v] of ops) uf_union(u, v);
  });
});
