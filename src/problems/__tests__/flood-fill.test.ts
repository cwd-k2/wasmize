import { describe, test, expect } from "vitest";
import { problem12_flood_fill } from "../flood-fill";

describe("Flood Fill", () => {
  test("fills a 3x3 grid", async () => {
    const wasm = problem12_flood_fill();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const flood_fill = instance.exports.flood_fill as (
      W: number, H: number, sx: number, sy: number, target: number, fill: number,
    ) => number;

    // 3x3 grid, all 1s
    const W = 3, H = 3;
    for (let i = 0; i < W * H; i++) mem[i] = 1;

    const count = flood_fill(W, H, 1, 1, 1, 2);
    expect(count).toBe(9); // all cells filled
  });

  test("fills only connected region", async () => {
    const wasm = problem12_flood_fill();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const flood_fill = instance.exports.flood_fill as (
      W: number, H: number, sx: number, sy: number, target: number, fill: number,
    ) => number;

    // 4x4 grid with barrier
    // 1 1 0 1
    // 1 1 0 1
    // 0 0 0 1
    // 1 1 1 1
    const W = 4, H = 4;
    const grid = [
      1, 1, 0, 1,
      1, 1, 0, 1,
      0, 0, 0, 1,
      1, 1, 1, 1,
    ];
    grid.forEach((v, i) => { mem[i] = v; });

    const count = flood_fill(W, H, 0, 0, 1, 2);
    expect(count).toBe(4); // top-left 2x2 region
  });

  test("returns 0 when start doesn't match target", async () => {
    const wasm = problem12_flood_fill();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const memory = instance.exports.memory as WebAssembly.Memory;
    const mem = new Int32Array(memory.buffer);
    const flood_fill = instance.exports.flood_fill as (
      W: number, H: number, sx: number, sy: number, target: number, fill: number,
    ) => number;

    mem[0] = 5;
    expect(flood_fill(1, 1, 0, 0, 1, 2)).toBe(0);
  });
});
