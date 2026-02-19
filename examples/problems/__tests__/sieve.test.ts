import { describe, test, expect } from "vitest";
import { problem7_sieve } from "../sieve";
import { instantiate } from "@/test-helpers";

describe("Sieve of Eratosthenes", () => {
  test.each([
    [10, 4],      // 2, 3, 5, 7
    [2, 1],
    [1, 0],
    [30, 10],     // 2,3,5,7,11,13,17,19,23,29
    [100, 25],
    [1000, 168],
  ])("sieve(%i) = %i primes", async (n, expected) => {
    const { exports: { sieve } } = await instantiate(problem7_sieve());

    expect(sieve(n)).toBe(expected);
  });
});
