import { describe, test, expect } from "vitest";
import { problem4_coin_change } from "../coin-change";

describe("Coin Change DP", () => {
  test.each([
    { coins: [1, 5, 10, 25], amount: 30, expected: 2 },
    { coins: [2], amount: 3, expected: -1 },
    { coins: [1, 2, 5], amount: 11, expected: 3 },
    { coins: [1], amount: 0, expected: 0 },
    { coins: [1, 5, 10], amount: 27, expected: 5 },
  ])(
    "coins=$coins amount=$amount → $expected",
    async ({ coins, amount, expected }) => {
      const wasm = problem4_coin_change();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { instance } = (await WebAssembly.instantiate(wasm)) as any;
      const memory = instance.exports.memory as WebAssembly.Memory;
      const mem = new Int32Array(memory.buffer);

      // Clear dp area
      for (let i = 0; i <= amount; i++) mem[i] = 0;
      // Set coins at offset 2048
      const COIN_BASE = 2048 / 4;
      coins.forEach((c, i) => {
        mem[COIN_BASE + i] = c;
      });

      const coin_change = instance.exports.coin_change as (
        amount: number,
        numCoins: number,
      ) => number;

      expect(coin_change(amount, coins.length)).toBe(expected);
    },
  );
});
