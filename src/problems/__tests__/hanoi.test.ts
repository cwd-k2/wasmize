import { describe, test, expect } from "vitest";
import { problem1_hanoi } from "../hanoi";

describe("Tower of Hanoi", () => {
  test("hanoi(4) returns 15 moves and fires 15 effect events", async () => {
    const wasm = problem1_hanoi();
    const moves: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm, {
      env: {
        effect_move: (from: number, to: number) => {
          moves.push(`${from}→${to}`);
        },
      },
    })) as any;
    const hanoi = instance.exports.hanoi as (
      n: number,
      from: number,
      to: number,
      aux: number,
    ) => number;

    const count = hanoi(4, 1, 3, 2);

    expect(count).toBe(15);
    expect(moves).toHaveLength(15);
  });
});
