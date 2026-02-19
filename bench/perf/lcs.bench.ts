import { bench, describe } from "vitest";
import { problem9_lcs } from "../../examples/problems/lcs";
import { instantiate } from "@/test-helpers";
import { jsLcs } from "../js-impls";

const N = 256;
const a = Array.from({ length: N }, () => Math.floor(Math.random() * 26));
const b = Array.from({ length: N }, () => Math.floor(Math.random() * 26));

const { exports: { lcs }, mem } = await instantiate(problem9_lcs());
a.forEach((v, i) => { mem![i] = v; });
b.forEach((v, i) => { mem![1024 / 4 + i] = v; });

describe("lcs 256x256", () => {
  bench("JS", () => {
    jsLcs(a, b);
  });

  bench("Wasm", () => {
    lcs(N, N);
  });
});
