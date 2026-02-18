import { bench, describe } from "vitest";
import { problem4_coin_change } from "../../src/problems/coin-change";
import { jsCoinChange } from "../js-impls";

const AMOUNT = 5000;
const COINS = [1, 5, 10, 25, 50];

const binary = problem4_coin_change();
const { instance } = (await WebAssembly.instantiate(binary)) as any;
const wasmMemory = instance.exports.memory as WebAssembly.Memory;
const wasmMem = new Int32Array(wasmMemory.buffer);
const COIN_BASE = 2048 / 4;
COINS.forEach((c, i) => { wasmMem[COIN_BASE + i] = c; });
const wasmCoinChange: (amount: number, numCoins: number) => number =
  instance.exports.coin_change;

describe("coin-change amount=5000", () => {
  bench("JS", () => {
    jsCoinChange(AMOUNT, COINS);
  });

  bench("Wasm", () => {
    wasmCoinChange(AMOUNT, COINS.length);
  });
});
