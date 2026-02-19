import { bench, describe } from "vitest";
import { problem1_hanoi } from "../../examples/problems/hanoi";
import { problem2_fib_dp } from "../../examples/problems/fibonacci";
import { problem3_kadane } from "../../examples/problems/kadane";
import { problem4_coin_change } from "../../examples/problems/coin-change";
import { problem5_binary_search } from "../../examples/problems/binary-search";
import { problem6_gcd_array } from "../../examples/problems/gcd";
import { problem7_sieve } from "../../examples/problems/sieve";
import { problem8_matmul } from "../../examples/problems/matmul";
import { problem9_lcs } from "../../examples/problems/lcs";
import { problem10_knapsack } from "../../examples/problems/knapsack";
import { problem11_quicksort } from "../../examples/problems/quicksort";
import { problem12_flood_fill } from "../../examples/problems/flood-fill";
import { problem13_lis } from "../../examples/problems/lis";
import { problem14_nqueens } from "../../examples/problems/nqueens";
import { problem15_union_find } from "../../examples/problems/union-find";

const problems = [
  { name: "hanoi", compile: problem1_hanoi, imports: { env: { effect_move: () => {} } } },
  { name: "fibonacci", compile: problem2_fib_dp, imports: undefined },
  { name: "kadane", compile: problem3_kadane, imports: undefined },
  { name: "coin-change", compile: problem4_coin_change, imports: undefined },
  { name: "binary-search", compile: problem5_binary_search, imports: undefined },
  { name: "gcd-array", compile: problem6_gcd_array, imports: undefined },
  { name: "sieve", compile: problem7_sieve, imports: undefined },
  { name: "matmul", compile: problem8_matmul, imports: undefined },
  { name: "lcs", compile: problem9_lcs, imports: undefined },
  { name: "knapsack", compile: problem10_knapsack, imports: undefined },
  { name: "quicksort", compile: problem11_quicksort, imports: undefined },
  { name: "flood-fill", compile: problem12_flood_fill, imports: undefined },
  { name: "lis", compile: problem13_lis, imports: undefined },
  { name: "nqueens", compile: problem14_nqueens, imports: undefined },
  { name: "union-find", compile: problem15_union_find, imports: undefined },
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
