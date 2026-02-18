import { bench, describe } from "vitest";
import { problem12_flood_fill } from "../../src/problems/flood-fill";
import { jsFloodFill } from "../js-impls";

const W = 64, H = 64;

const binary = problem12_flood_fill();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const memory = instance.exports.memory as WebAssembly.Memory;
const wasmFloodFill: (W: number, H: number, sx: number, sy: number, target: number, fill: number) => number =
  instance.exports.flood_fill;

describe("flood-fill 64x64", () => {
  bench("JS", () => {
    const grid = new Array(W * H).fill(1);
    jsFloodFill(grid, W, H, 0, 0, 1, 2);
  });

  bench("Wasm", () => {
    const mem = new Int32Array(memory.buffer);
    for (let i = 0; i < W * H; i++) mem[i] = 1;
    wasmFloodFill(W, H, 0, 0, 1, 2);
  });
});
