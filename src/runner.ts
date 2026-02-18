import {
  problem1_hanoi,
  problem2_fib_dp,
  problem3_kadane,
  problem4_coin_change,
  problem5_binary_search,
  problem6_gcd_array,
  problem7_sieve,
  problem8_matmul,
  problem9_lcs,
  problem10_knapsack,
  problem11_quicksort,
  problem12_flood_fill,
  problem13_lis,
  problem14_nqueens,
  problem15_union_find,
} from "./problems";

export interface TestCase {
  input: string;
  expected: number;
  got: number;
}

export interface ProblemResult {
  num: number;
  title: string;
  pass: boolean;
  output: string;
  effects?: string;
  detail: string;
  wasmSize: number;
  tests: TestCase[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WasmExports = Record<string, (...args: any[]) => any> & {
  memory: WebAssembly.Memory;
};

async function instantiate(
  bytes: Uint8Array,
  imports?: WebAssembly.Imports,
): Promise<WasmExports> {
  // WebAssembly.instantiate with BufferSource returns { module, instance }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = await WebAssembly.instantiate(bytes, imports);
  return result.instance.exports as WasmExports;
}

export async function runTests(): Promise<ProblemResult[]> {
  const results: ProblemResult[] = [];

  // --- Problem 1: Hanoi ---
  {
    const wasm = problem1_hanoi();
    const moves: string[] = [];
    const exp = await instantiate(wasm, {
      env: {
        effect_move: (from: number, to: number) => {
          moves.push(`${from}\u2192${to}`);
        },
      },
    });
    const count: number = exp.hanoi(4, 1, 3, 2);
    const pass = count === 15 && moves.length === 15;
    results.push({
      num: 1,
      title: "Tower of Hanoi (n=4, recursive + effects)",
      pass,
      output: `hanoi(4) = ${count} moves`,
      effects: `Moves: ${moves.slice(0, 6).join(", ")}${moves.length > 6 ? ` ... (${moves.length} total)` : ""}`,
      detail: `Expected 2^4-1=15 moves. Got ${count}. Effect system captured ${moves.length} move events.`,
      wasmSize: wasm.length,
      tests: [{ input: "hanoi(4, 1, 3, 2)", expected: 15, got: count }],
    });
  }

  // --- Problem 2: Fibonacci DP ---
  {
    const wasm = problem2_fib_dp();
    const exp = await instantiate(wasm);
    const cases: [number, number][] = [
      [0, 0],
      [1, 1],
      [2, 1],
      [5, 5],
      [10, 55],
      [20, 6765],
      [30, 832040],
    ];
    const got = cases.map(([n]) => exp.fib(n) as number);
    const pass = cases.every(([_n, expected], i) => got[i] === expected);
    results.push({
      num: 2,
      title: "Fibonacci DP (bottom-up, linear memory table)",
      pass,
      output: cases.map(([n], i) => `fib(${n}) = ${got[i]}`).join("\n"),
      detail: pass ? "All test cases passed." : "Some test cases failed.",
      wasmSize: wasm.length,
      tests: cases.map(([n, expected], i) => ({
        input: `fib(${n})`,
        expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 3: Kadane ---
  {
    const wasm = problem3_kadane();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const testCases = [
      { arr: [-2, 1, -3, 4, -1, 2, 1, -5, 4], expected: 6 },
      { arr: [1], expected: 1 },
      { arr: [-1, -2, -3], expected: -1 },
      { arr: [5, 4, -1, 7, 8], expected: 23 },
    ];

    const got = testCases.map((tc) => {
      const base = 1024 / 4;
      tc.arr.forEach((v, i) => {
        mem[base + i] = v;
      });
      return exp.kadane(tc.arr.length) as number;
    });

    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 3,
      title: "Maximum Subarray Sum (Kadane's Algorithm)",
      pass,
      output: testCases
        .map((tc, i) => `kadane([${tc.arr}]) = ${got[i]}`)
        .join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `kadane([${tc.arr}])`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 4: Coin Change DP ---
  {
    const wasm = problem4_coin_change();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const testCases = [
      { coins: [1, 5, 10, 25], amount: 30, expected: 2 },
      { coins: [2], amount: 3, expected: -1 },
      { coins: [1, 2, 5], amount: 11, expected: 3 },
      { coins: [1], amount: 0, expected: 0 },
      { coins: [1, 5, 10], amount: 27, expected: 5 },
    ];

    const COIN_BASE = 2048 / 4;
    const got = testCases.map((tc) => {
      for (let i = 0; i <= tc.amount; i++) mem[i] = 0;
      tc.coins.forEach((c, i) => {
        mem[COIN_BASE + i] = c;
      });
      return exp.coin_change(tc.amount, tc.coins.length) as number;
    });

    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 4,
      title: "Coin Change DP (minimum coins)",
      pass,
      output: testCases
        .map(
          (tc, i) =>
            `coins=[${tc.coins}] amount=${tc.amount} \u2192 ${got[i]}`,
        )
        .join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `coin_change(${tc.amount}, [${tc.coins}])`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 5: Binary Search ---
  {
    const wasm = problem5_binary_search();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const arr = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91];
    arr.forEach((v, i) => {
      mem[i] = v;
    });

    const testCases = [
      { target: 23, expected: 5 },
      { target: 2, expected: 0 },
      { target: 91, expected: 9 },
      { target: 50, expected: -1 },
      { target: 12, expected: 3 },
    ];

    const got = testCases.map(
      (tc) => exp.binary_search(arr.length, tc.target) as number,
    );
    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 5,
      title: "Binary Search (sorted array in linear memory)",
      pass,
      output:
        `array = [${arr}]\n` +
        testCases
          .map(
            (tc, i) =>
              `search(${tc.target}) = ${got[i] === -1 ? "not found" : `index ${got[i]}`}`,
          )
          .join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `binary_search(${tc.target})`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 6: GCD Array ---
  {
    const wasm = problem6_gcd_array();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const testCases = [
      { arr: [12, 8], expected: 4 },
      { arr: [6], expected: 6 },
      { arr: [12, 18, 24], expected: 6 },
      { arr: [100, 75, 50, 25], expected: 25 },
    ];

    const got = testCases.map((tc) => {
      tc.arr.forEach((v, i) => { mem[i] = v; });
      return exp.array_gcd(tc.arr.length) as number;
    });

    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 6,
      title: "GCD Array (Euclidean algorithm × array scan)",
      pass,
      output: testCases.map((tc, i) => `gcd([${tc.arr}]) = ${got[i]}`).join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `array_gcd([${tc.arr}])`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 7: Sieve of Eratosthenes ---
  {
    const wasm = problem7_sieve();
    const exp = await instantiate(wasm);
    const cases: [number, number][] = [[10, 4], [100, 25], [1000, 168]];
    const got = cases.map(([n]) => exp.sieve(n) as number);
    const pass = cases.every(([, expected], i) => got[i] === expected);
    results.push({
      num: 7,
      title: "Sieve of Eratosthenes (byte-level memory)",
      pass,
      output: cases.map(([n], i) => `sieve(${n}) = ${got[i]} primes`).join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: cases.map(([n, expected], i) => ({
        input: `sieve(${n})`,
        expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 8: Matrix Multiply ---
  {
    const wasm = problem8_matmul();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const n = 3;
    const nn = n * n;
    [1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((v, i) => { mem[i] = v; });
    [9, 8, 7, 6, 5, 4, 3, 2, 1].forEach((v, i) => { mem[nn + i] = v; });

    const c00 = exp.matmul(n) as number;
    const pass = c00 === 30;
    results.push({
      num: 8,
      title: "Matrix Multiply (naive 3-loop)",
      pass,
      output: `matmul(3): C[0][0] = ${c00}`,
      detail: pass ? "C[0][0] = 30 as expected." : `Expected 30, got ${c00}.`,
      wasmSize: wasm.length,
      tests: [{ input: "matmul(3)", expected: 30, got: c00 }],
    });
  }

  // --- Problem 9: LCS Length ---
  {
    const wasm = problem9_lcs();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const testCases = [
      { a: [1, 2, 3, 4, 5], b: [2, 4, 5], expected: 3 },
      { a: [1, 3, 4, 1], b: [1, 3, 1, 4], expected: 3 },
    ];

    const got = testCases.map((tc) => {
      tc.a.forEach((v, i) => { mem[i] = v; });
      tc.b.forEach((v, i) => { mem[1024 / 4 + i] = v; });
      return exp.lcs(tc.a.length, tc.b.length) as number;
    });

    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 9,
      title: "LCS Length (2D DP)",
      pass,
      output: testCases.map((tc, i) => `lcs([${tc.a}], [${tc.b}]) = ${got[i]}`).join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `lcs([${tc.a}], [${tc.b}])`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 10: 0/1 Knapsack ---
  {
    const wasm = problem10_knapsack();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const weights = [2, 3, 4, 5];
    const values = [3, 4, 5, 6];
    weights.forEach((w, i) => { mem[i] = w; });
    values.forEach((v, i) => { mem[4096 / 4 + i] = v; });

    const got = exp.knapsack(weights.length, 5) as number;
    const pass = got === 7;
    results.push({
      num: 10,
      title: "0/1 Knapsack (reverse DP)",
      pass,
      output: `knapsack(4 items, cap=5) = ${got}`,
      detail: pass ? "Max value 7 as expected." : `Expected 7, got ${got}.`,
      wasmSize: wasm.length,
      tests: [{ input: "knapsack(4, 5)", expected: 7, got }],
    });
  }

  // --- Problem 11: Quicksort ---
  {
    const wasm = problem11_quicksort();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const arr = [5, 3, 8, 1, 2, 7, 4, 6];
    arr.forEach((v, i) => { mem[i] = v; });
    exp.quicksort(0, arr.length - 1);
    const sorted = Array.from({ length: arr.length }, (_, i) => mem[i]);
    const pass = sorted.every((v, i) => v === i + 1);
    results.push({
      num: 11,
      title: "Quicksort (Lomuto partition, recursive)",
      pass,
      output: `quicksort([${arr}]) = [${sorted}]`,
      detail: pass ? "Correctly sorted." : "Sort result incorrect.",
      wasmSize: wasm.length,
      tests: [{ input: `quicksort([${arr}])`, expected: 12345678, got: Number(sorted.join("")) }],
    });
  }

  // --- Problem 12: Flood Fill ---
  {
    const wasm = problem12_flood_fill();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const W = 3, H = 3;
    for (let i = 0; i < W * H; i++) mem[i] = 1;
    const got = exp.flood_fill(W, H, 1, 1, 1, 2) as number;
    const pass = got === 9;
    results.push({
      num: 12,
      title: "Flood Fill (BFS with memory queue)",
      pass,
      output: `flood_fill(3×3, all 1s) = ${got} cells`,
      detail: pass ? "All 9 cells filled." : `Expected 9, got ${got}.`,
      wasmSize: wasm.length,
      tests: [{ input: "flood_fill(3,3,1,1,1,2)", expected: 9, got }],
    });
  }

  // --- Problem 13: LIS ---
  {
    const wasm = problem13_lis();
    const exp = await instantiate(wasm);
    const mem = new Int32Array(exp.memory.buffer);

    const testCases = [
      { arr: [10, 9, 2, 5, 3, 7, 101, 18], expected: 4 },
      { arr: [0, 1, 0, 3, 2, 3], expected: 4 },
    ];

    const got = testCases.map((tc) => {
      tc.arr.forEach((v, i) => { mem[i] = v; });
      return exp.lis(tc.arr.length) as number;
    });

    const pass = testCases.every((tc, i) => got[i] === tc.expected);
    results.push({
      num: 13,
      title: "LIS (patience sort + binary search)",
      pass,
      output: testCases.map((tc, i) => `lis([${tc.arr}]) = ${got[i]}`).join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: testCases.map((tc, i) => ({
        input: `lis([${tc.arr}])`,
        expected: tc.expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 14: N-Queens Count ---
  {
    const wasm = problem14_nqueens();
    const exp = await instantiate(wasm);
    const cases: [number, number][] = [[8, 92], [10, 724]];
    const got = cases.map(([n]) => exp.nqueens(n) as number);
    const pass = cases.every(([, expected], i) => got[i] === expected);
    results.push({
      num: 14,
      title: "N-Queens Count (backtracking + bitmask)",
      pass,
      output: cases.map(([n], i) => `nqueens(${n}) = ${got[i]}`).join("\n"),
      detail: pass ? "All test cases passed." : "Some cases failed.",
      wasmSize: wasm.length,
      tests: cases.map(([n, expected], i) => ({
        input: `nqueens(${n})`,
        expected,
        got: got[i]!,
      })),
    });
  }

  // --- Problem 15: Union-Find ---
  {
    const wasm = problem15_union_find();
    const exp = await instantiate(wasm);

    exp.uf_init(5);
    exp.uf_union(0, 1);
    exp.uf_union(2, 3);
    exp.uf_union(0, 2);
    const count = exp.uf_count() as number;
    const findCheck = (exp.uf_find(0) as number) === (exp.uf_find(3) as number);
    const pass = count === 2 && findCheck;
    results.push({
      num: 15,
      title: "Union-Find (DSU with path compression + rank)",
      pass,
      output: `init(5), union(0,1), union(2,3), union(0,2) → count=${count}`,
      detail: pass ? "Count=2, find(0)==find(3) as expected." : "Union-Find check failed.",
      wasmSize: wasm.length,
      tests: [{ input: "uf_count() after 3 unions on 5 elements", expected: 2, got: count }],
    });
  }

  return results;
}
