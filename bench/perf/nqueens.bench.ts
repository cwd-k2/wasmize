import { bench, describe } from "vitest";
import { problem14_nqueens } from "../../examples/problems/nqueens";
import { instantiate } from "@/test-helpers";
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
