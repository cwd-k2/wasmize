import { describe, test, expect } from "vitest";
import { problem7_sieve } from "../sieve";

describe("Sieve of Eratosthenes", () => {
  test.each([
    [10, 4],      // 2, 3, 5, 7
    [2, 1],
    [1, 0],
    [30, 10],     // 2,3,5,7,11,13,17,19,23,29
    [100, 25],
    [1000, 168],
  ])("sieve(%i) = %i primes", async (n, expected) => {
    const wasm = problem7_sieve();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { instance } = (await WebAssembly.instantiate(wasm)) as any;
    const sieve = instance.exports.sieve as (n: number) => number;

    expect(sieve(n)).toBe(expected);
  });
});
