import {
  problem1_hanoi,
  problem2_fib_dp,
  problem3_kadane,
  problem4_coin_change,
  problem5_binary_search,
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

  return results;
}
