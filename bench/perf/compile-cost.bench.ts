import { bench, describe } from "vitest";
import { problem1_hanoi } from "../../src/problems/hanoi";
import { problem2_fib_dp } from "../../src/problems/fibonacci";
import { problem3_kadane } from "../../src/problems/kadane";
import { problem4_coin_change } from "../../src/problems/coin-change";
import { problem5_binary_search } from "../../src/problems/binary-search";

const problems = [
  { name: "hanoi", compile: problem1_hanoi, imports: { env: { effect_move: () => {} } } },
  { name: "fibonacci", compile: problem2_fib_dp, imports: undefined },
  { name: "kadane", compile: problem3_kadane, imports: undefined },
  { name: "coin-change", compile: problem4_coin_change, imports: undefined },
  { name: "binary-search", compile: problem5_binary_search, imports: undefined },
] as const;

describe("compile() cost", () => {
  for (const p of problems) {
    bench(`compile: ${p.name}`, () => {
      p.compile();
    });
  }
});

describe("compile() + instantiate() cost", () => {
  for (const p of problems) {
    bench(`compile+instantiate: ${p.name}`, async () => {
      const binary = p.compile();
      await WebAssembly.instantiate(binary, p.imports);
    });
  }
});
