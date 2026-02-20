import { describe, test, expect } from "vitest";
import { problem1_hanoi } from "../hanoi";
import { instantiate } from "@/test-helpers";

describe("Tower of Hanoi", () => {
  test("hanoi(4) returns 15 moves", async () => {
    const {
      exports: { hanoi },
    } = await instantiate(problem1_hanoi());
    expect(hanoi(4, 1, 3, 2)).toBe(15);
  });

  test("hanoi(0) returns 0", async () => {
    const {
      exports: { hanoi },
    } = await instantiate(problem1_hanoi());
    expect(hanoi(0, 1, 3, 2)).toBe(0);
  });

  test("hanoi(1) returns 1", async () => {
    const {
      exports: { hanoi },
    } = await instantiate(problem1_hanoi());
    expect(hanoi(1, 1, 3, 2)).toBe(1);
  });
});
