/**
 * IR statistics analysis for profiling and optimization reporting.
 *
 * {@link analyzeFunc} and {@link analyzeModule} walk IR trees to collect
 * metrics: total nodes, nodes by opcode, max nesting depth, memory ops,
 * branches, calls, and local accesses. {@link formatStats} produces a
 * human-readable summary.
 *
 * @module
 */
import type { IRNode } from "./ir";
import type { FuncDef } from "./module";
import { visitChildren } from "./optimizer-passes";

export interface IRStats {
  totalNodes: number;
  nodesByOp: Record<string, number>;
  maxDepth: number;
  memoryLoads: number;
  memoryStores: number;
  branches: number;
  calls: number;
  localAccesses: number;
}

function emptyStats(): IRStats {
  return {
    totalNodes: 0,
    nodesByOp: {},
    maxDepth: 0,
    memoryLoads: 0,
    memoryStores: 0,
    branches: 0,
    calls: 0,
    localAccesses: 0,
  };
}

const loadOps = new Set(["load_i32", "load_i32_8u", "load_i64", "load_f64", "mem_load"]);

const storeOps = new Set(["store_i32", "store_i32_8", "store_i64", "store_f64", "mem_store"]);

const branchOps = new Set(["if", "br", "br_if", "br_table"]);

const callOps = new Set(["call", "call_indirect"]);

const localOps = new Set(["local_get", "local_set", "local_tee"]);

function countNode(node: IRNode, stats: IRStats, depth: number): void {
  stats.totalNodes++;
  stats.nodesByOp[node.op] = (stats.nodesByOp[node.op] || 0) + 1;
  if (depth > stats.maxDepth) stats.maxDepth = depth;

  if (loadOps.has(node.op)) stats.memoryLoads++;
  if (storeOps.has(node.op)) stats.memoryStores++;
  if (branchOps.has(node.op)) stats.branches++;
  if (callOps.has(node.op)) stats.calls++;
  if (localOps.has(node.op)) stats.localAccesses++;

  // Walk children using visitChildren (which returns a new node, but we discard it)
  visitChildren(node, (child) => {
    countNode(child, stats, depth + 1);
    return child;
  });
}

/** Analyzes a single function body and returns IR statistics. */
export function analyzeFunc(body: IRNode[]): IRStats {
  const stats = emptyStats();
  for (const node of body) {
    countNode(node, stats, 0);
  }
  return stats;
}

/** Analyzes all functions in a module and returns aggregate + per-function stats. */
export function analyzeModule(funcs: FuncDef[]): { total: IRStats; perFunction: IRStats[] } {
  const perFunction = funcs.map((f) => analyzeFunc(f.body));
  const total = emptyStats();

  for (const s of perFunction) {
    total.totalNodes += s.totalNodes;
    total.memoryLoads += s.memoryLoads;
    total.memoryStores += s.memoryStores;
    total.branches += s.branches;
    total.calls += s.calls;
    total.localAccesses += s.localAccesses;
    if (s.maxDepth > total.maxDepth) total.maxDepth = s.maxDepth;
    for (const [op, count] of Object.entries(s.nodesByOp)) {
      total.nodesByOp[op] = (total.nodesByOp[op] || 0) + count;
    }
  }

  return { total, perFunction };
}

/** Formats IR statistics as a human-readable string. */
export function formatStats(stats: IRStats): string {
  const lines: string[] = [
    `Total nodes: ${stats.totalNodes}`,
    `Max depth: ${stats.maxDepth}`,
    `Memory: ${stats.memoryLoads} loads, ${stats.memoryStores} stores`,
    `Branches: ${stats.branches}`,
    `Calls: ${stats.calls}`,
    `Local accesses: ${stats.localAccesses}`,
  ];

  const sorted = Object.entries(stats.nodesByOp).sort(([, a], [, b]) => b - a);
  if (sorted.length > 0) {
    lines.push("Nodes by op:");
    for (const [op, count] of sorted) {
      lines.push(`  ${op}: ${count}`);
    }
  }

  return lines.join("\n");
}
