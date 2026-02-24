/**
 * IR optimization entry point.
 *
 * {@link optimizeFunc} applies a configurable set of optimizer passes
 * to a function body's IR nodes, iterating multiple times for fixed-point
 * convergence. Re-exports pass infrastructure from `optimizer-passes.ts`.
 *
 * @module
 */
import type { IRNode } from "./ir";
import {
  builtinPasses,
  createOptimizer,
  eliminateDeadCode,
  type OptimizerConfig,
} from "./optimizer-passes";

export { eliminateDeadCode } from "./optimizer-passes";
export type { OptimizerPass, OptimizerConfig } from "./optimizer-passes";
export { visitChildren, builtinPasses, createOptimizer, withoutPasses } from "./optimizer-passes";

// --- Public API ---

export function optimizeFunc(body: IRNode[], config?: OptimizerConfig): IRNode[] {
  const passes = config?.passes ?? builtinPasses;
  const iterations = config?.iterations ?? 2;
  const optimizeNode = createOptimizer(passes);
  let result = body;
  for (let i = 0; i < iterations; i++) {
    result = eliminateDeadCode(result.map(optimizeNode));
  }
  return result;
}
