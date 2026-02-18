import { bench, describe } from "vitest";
import { problem14_nqueens } from "../../src/problems/nqueens";
import { instantiate } from "../../src/test-helpers";
import { jsNqueens } from "../js-impls";

const { exports: { nqueens } } = await instantiate(problem14_nqueens());

describe("nqueens n=12", () => {
  bench("JS", () => {
    jsNqueens(12);
  });

  bench("Wasm", () => {
    nqueens(12);
  });
});
