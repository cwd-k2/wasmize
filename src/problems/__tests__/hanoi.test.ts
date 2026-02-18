import { describe, test, expect } from "vitest";
import { problem1_hanoi } from "../hanoi";
import { instantiate } from "../../test-helpers";

describe("Tower of Hanoi", () => {
  test("hanoi(4) returns 15 moves and fires 15 effect events", async () => {
    const moves: string[] = [];
    const { exports: { hanoi } } = await instantiate(problem1_hanoi(), {
      env: {
        effect_move: (from: number, to: number) => {
          moves.push(`${from}→${to}`);
        },
      },
    });

    const count = hanoi(4, 1, 3, 2);

    expect(count).toBe(15);
    expect(moves).toHaveLength(15);
  });
});
