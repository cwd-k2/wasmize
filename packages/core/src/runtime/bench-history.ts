/**
 * Performance regression tracking utilities.
 *
 * Provides save/load/compare functions for benchmark results,
 * enabling detection of performance regressions across runs.
 *
 * @module
 */
// @ts-expect-error -- node:fs has no type declarations in this project
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
// @ts-expect-error -- node:path has no type declarations in this project
import { dirname } from "node:path";

/** A single benchmark result snapshot. */
export interface BenchmarkResult {
  name: string;
  opsPerSec: number;
  meanMs: number;
}

/** Stored benchmark history entry with timestamp. */
interface BenchmarkEntry {
  timestamp: string;
  result: BenchmarkResult;
}

/** Stored benchmark history file format. */
interface BenchmarkHistory {
  entries: BenchmarkEntry[];
}

/**
 * Saves a benchmark result to a JSON history file.
 *
 * Creates the file if it doesn't exist, otherwise appends to the
 * existing entries array.
 *
 * @param name - Benchmark name (must match result.name)
 * @param result - The benchmark result to save
 * @param filePath - Path to the JSON file
 */
export function saveBenchmark(name: string, result: BenchmarkResult, filePath: string): void {
  let history: BenchmarkHistory;

  if (existsSync(filePath)) {
    const raw = readFileSync(filePath, "utf-8");
    history = JSON.parse(raw) as BenchmarkHistory;
  } else {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    history = { entries: [] };
  }

  history.entries.push({
    timestamp: new Date().toISOString(),
    result: { ...result, name },
  });

  writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
}

/**
 * Loads benchmark results from a JSON history file.
 *
 * @param filePath - Path to the JSON file
 * @returns Array of stored benchmark results
 */
export function loadBenchmark(filePath: string): BenchmarkResult[] {
  if (!existsSync(filePath)) {
    return [];
  }

  const raw = readFileSync(filePath, "utf-8");
  const history = JSON.parse(raw) as BenchmarkHistory;
  return history.entries.map((e) => e.result);
}

/**
 * Compares two benchmark results for performance regression.
 *
 * @param baseline - The reference benchmark result
 * @param current - The current benchmark result
 * @param threshold - Regression threshold ratio (default: 1.1 = 10% slower is regression)
 * @returns Object with `regressed` flag and `ratio` (current.meanMs / baseline.meanMs)
 */
export function compareBenchmarks(
  baseline: BenchmarkResult,
  current: BenchmarkResult,
  threshold = 1.1,
): { regressed: boolean; ratio: number } {
  const ratio = current.meanMs / baseline.meanMs;
  return {
    regressed: ratio > threshold,
    ratio,
  };
}
