import type { WasmBinary } from "./dsl/types";

export interface BenchResult {
  wasm: { mean: number; median: number; stddev: number };
  js?: { mean: number; median: number; stddev: number };
  speedup?: number;
}

function stats(times: number[]): { mean: number; median: number; stddev: number } {
  const sorted = [...times].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((s, t) => s + t, 0) / n;
  const median =
    n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!;
  const variance = sorted.reduce((s, t) => s + (t - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  return { mean, median, stddev };
}

/**
 * Benchmarks a Wasm function with optional JS baseline comparison.
 *
 * @param binary - Compiled Wasm binary
 * @param name - Name of the exported function to benchmark
 * @param setup - Setup function: receives Int32Array view of memory,
 *                returns args to pass to the exported function
 * @param options - Warmup iterations, measurement iterations, and optional JS baseline
 *
 * @example
 * ```ts
 * const result = await bench(binary, "sort", (mem) => {
 *   const data = [5, 3, 8, 1];
 *   data.forEach((v, i) => { mem[i] = v; });
 *   return [0, data.length - 1];
 * }, {
 *   baseline: (lo, hi) => { ... },
 * });
 * console.log(result.speedup); // e.g. 2.5
 * ```
 */
export async function bench<T = Record<string, unknown>>(
  binary: WasmBinary<T>,
  name: string & keyof T,
  setup: (mem: Int32Array) => any[],
  options?: {
    warmup?: number;
    iterations?: number;
    baseline?: (...args: any[]) => any;
  },
): Promise<BenchResult> {
  const warmup = options?.warmup ?? 10;
  const iterations = options?.iterations ?? 100;

  const { instance } = await WebAssembly.instantiate(binary);
  const fn = instance.exports[name as string] as Function;
  const memory = instance.exports.memory as WebAssembly.Memory;
  const mem = new Int32Array(memory.buffer);

  // Warmup
  for (let i = 0; i < warmup; i++) {
    const args = setup(mem);
    fn(...args);
  }

  // Measure Wasm
  const wasmTimes: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const args = setup(mem);
    const start = performance.now();
    fn(...args);
    const elapsed = performance.now() - start;
    wasmTimes.push(elapsed);
  }

  const result: BenchResult = { wasm: stats(wasmTimes) };

  // Measure JS baseline if provided
  if (options?.baseline) {
    // Warmup
    for (let i = 0; i < warmup; i++) {
      const args = setup(mem);
      options.baseline(...args);
    }

    const jsTimes: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const args = setup(mem);
      const start = performance.now();
      options.baseline(...args);
      const elapsed = performance.now() - start;
      jsTimes.push(elapsed);
    }

    result.js = stats(jsTimes);
    result.speedup = result.js.median / result.wasm.median;
  }

  return result;
}
