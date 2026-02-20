import { describe, test, expect } from "vitest";
import { problem12_flood_fill } from "../flood-fill";
import { instantiate } from "@/test-helpers";

describe("Flood Fill", () => {
  test("fills a 3x3 grid", async () => {
    const {
      exports: { flood_fill },
      mem,
    } = await instantiate(problem12_flood_fill());

    const W = 3,
      H = 3;
    for (let i = 0; i < W * H; i++) mem![i] = 1;

    const count = flood_fill(W, H, 1, 1, 1, 2);
    expect(count).toBe(9);
  });

  test("fills only connected region", async () => {
    const {
      exports: { flood_fill },
      mem,
    } = await instantiate(problem12_flood_fill());

    const W = 4,
      H = 4;
    const grid = [1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 1, 1, 1, 1, 1];
    grid.forEach((v, i) => {
      mem![i] = v;
    });

    const count = flood_fill(W, H, 0, 0, 1, 2);
    expect(count).toBe(4);
  });

  test("returns 0 when start doesn't match target", async () => {
    const {
      exports: { flood_fill },
      mem,
    } = await instantiate(problem12_flood_fill());

    mem![0] = 5;
    expect(flood_fill(1, 1, 0, 0, 1, 2)).toBe(0);
  });
});
