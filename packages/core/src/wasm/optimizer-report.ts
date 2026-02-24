/**
 * Optimization report: before/after IR comparison.
 *
 * {@link compileWithReport} compiles a program twice (unoptimized and
 * optimized) to produce an {@link OptimizationReport} with node count
 * reductions, memory op savings, and branch elimination metrics.
 * {@link formatReport} renders the report as a human-readable string.
 *
 * @module
 */
import { compileToIR } from "../dsl/interpreter";
import { compile } from "../dsl/interpreter";
import type { WasmBinary, WasmProgram } from "../dsl/types";
import type { OptimizerConfig } from "./optimizer-passes";
import { builtinPasses } from "./optimizer-passes";
import { analyzeModule, type IRStats } from "./ir-stats";

export interface OptimizationReport {
  before: IRStats;
  after: IRStats;
  passes: string[];
  iterations: number;
  reductions: {
    nodes: number;
    nodesPct: number;
    memoryOps: number;
    branches: number;
  };
}

/**
 * Compiles a program twice (unoptimized and optimized) and reports the differences.
 */
export function compileWithReport<T = Record<string, unknown>>(
  program: WasmProgram,
  options?: { optimizerConfig?: OptimizerConfig },
): { binary: WasmBinary<T>; report: OptimizationReport } {
  const config = options?.optimizerConfig;
  const passes = config?.passes ?? [...builtinPasses];
  const iterations = config?.iterations ?? 2;

  // Compile without optimization to get "before" stats
  const { funcs: beforeFuncs } = compileToIR(program, { optimize: false });
  const { total: before } = analyzeModule(beforeFuncs);

  // Compile with optimization to get "after" stats + binary
  const binary = compile<T>(program, {
    optimize: true,
    optimizerConfig: config,
  });
  const { funcs: afterFuncs } = compileToIR(program, {
    optimize: true,
    optimizerConfig: config,
  });
  const { total: after } = analyzeModule(afterFuncs);

  const nodeDiff = before.totalNodes - after.totalNodes;
  const report: OptimizationReport = {
    before,
    after,
    passes: passes.map((p) => p.name),
    iterations,
    reductions: {
      nodes: nodeDiff,
      nodesPct: before.totalNodes > 0 ? (nodeDiff / before.totalNodes) * 100 : 0,
      memoryOps:
        before.memoryLoads + before.memoryStores - (after.memoryLoads + after.memoryStores),
      branches: before.branches - after.branches,
    },
  };

  return { binary, report };
}

/** Formats an optimization report as a human-readable string. */
export function formatReport(report: OptimizationReport): string {
  const pct = (n: number) => (n >= 0 ? `-${n.toFixed(1)}%` : `+${Math.abs(n).toFixed(1)}%`);
  const lines = [
    `Optimization Report (${report.passes.length} passes, ${report.iterations} iterations)`,
    `  Nodes:    ${report.before.totalNodes} → ${report.after.totalNodes} (${pct(report.reductions.nodesPct)})`,
    `  Memory:   ${report.before.memoryLoads + report.before.memoryStores} → ${report.after.memoryLoads + report.after.memoryStores} (${report.reductions.memoryOps > 0 ? "-" : "+"}${Math.abs(report.reductions.memoryOps)})`,
    `  Branches: ${report.before.branches} → ${report.after.branches} (${report.reductions.branches > 0 ? "-" : "+"}${Math.abs(report.reductions.branches)})`,
  ];
  return lines.join("\n");
}
