import { bench, describe } from "vitest";
import { problem12_flood_fill } from "../../examples/problems/flood-fill";
import { instantiate } from "@/test-helpers";
import { jsFloodFill } from "../js-impls";

const W = 64, H = 64;

const { exports: { flood_fill }, mem } = await instantiate(problem12_flood_fill());

describe("flood-fill 64x64", () => {
  bench("JS", () => {
    const grid = new Array(W * H).fill(1);
    jsFloodFill(grid, W, H, 0, 0, 1, 2);
  });

  bench("Wasm", () => {
    for (let i = 0; i < W * H; i++) mem![i] = 1;
    flood_fill(W, H, 0, 0, 1, 2);
  });
});
