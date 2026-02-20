import { bench, describe } from "vitest";
import { problem4_coin_change } from "../../examples/problems/coin-change";
import { instantiate } from "@/test-helpers";
import { jsCoinChange } from "../js-impls";

const AMOUNT = 5000;
const COINS = [1, 5, 10, 25, 50];

const {
  exports: { coin_change },
  mem,
} = await instantiate(problem4_coin_change());
const COIN_BASE = 2048 / 4;
COINS.forEach((c, i) => {
  mem![COIN_BASE + i] = c;
});

describe("coin-change amount=5000", () => {
  bench("JS", () => {
    jsCoinChange(AMOUNT, COINS);
  });

  bench("Wasm", () => {
    coin_change(AMOUNT, COINS.length);
  });
});
