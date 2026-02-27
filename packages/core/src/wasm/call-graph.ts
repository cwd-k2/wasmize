/**
 * Call graph analysis utilities.
 *
 * Builds a call graph from compiled function definitions and provides
 * cycle detection (recursion) and dead function analysis.
 *
 * @module
 */
import type { FuncDef } from "./module";
import type { IRNode } from "./ir";

/**
 * Recursively collects call targets (direct and indirect) from an IR node tree.
 */
function collectCallees(node: IRNode, callees: Set<number>): void {
  switch (node.op) {
    case "call":
      callees.add(node.idx);
      for (const arg of node.args) collectCallees(arg, callees);
      break;
    case "call_indirect":
      // call_indirect uses a runtime index, but typeIdx references a function
      // for type signature matching — not a direct callee.
      // We still recurse into args and indexExpr.
      for (const arg of node.args) collectCallees(arg, callees);
      collectCallees(node.indexExpr, callees);
      break;
    case "return_call":
      callees.add(node.idx);
      for (const arg of node.args) collectCallees(arg, callees);
      break;
    case "return_call_indirect":
      for (const arg of node.args) collectCallees(arg, callees);
      collectCallees(node.indexExpr, callees);
      break;
    case "if":
      collectCallees(node.cond, callees);
      for (const n of node.then) collectCallees(n, callees);
      for (const n of node.else) collectCallees(n, callees);
      break;
    case "loop":
    case "block":
      for (const n of node.body) collectCallees(n, callees);
      break;
    case "seq":
      for (const n of node.stmts) collectCallees(n, callees);
      break;
    case "binop":
      collectCallees(node.a, callees);
      collectCallees(node.b, callees);
      break;
    case "cmp":
      collectCallees(node.a, callees);
      collectCallees(node.b, callees);
      break;
    case "unary":
    case "convert":
    case "eqz":
    case "f64_neg":
    case "f64_abs":
    case "i32_wrap_i64":
    case "i64_extend_i32_s":
    case "f64_convert_i32_s":
    case "i32_trunc_f64_s":
      collectCallees(node.val, callees);
      break;
    case "local_set":
    case "local_tee":
      collectCallees(node.val, callees);
      break;
    case "global_set":
      collectCallees(node.val, callees);
      break;
    case "store_i32":
    case "store_i32_8":
    case "store_i64":
    case "store_f64":
    case "mem_store":
      collectCallees(node.addr, callees);
      collectCallees(node.val, callees);
      break;
    case "load_i32":
    case "load_i32_8u":
    case "load_i64":
    case "load_f64":
    case "mem_load":
      collectCallees(node.addr, callees);
      break;
    case "select":
      collectCallees(node.a, callees);
      collectCallees(node.b, callees);
      collectCallees(node.cond, callees);
      break;
    case "br_if":
      collectCallees(node.cond, callees);
      break;
    case "br_table":
      collectCallees(node.val, callees);
      break;
    case "drop":
    case "return":
      collectCallees(node.val, callees);
      break;
    case "memory_grow":
      collectCallees(node.pages, callees);
      break;
    case "effect":
      collectCallees(node.payload, callees);
      break;
    case "memory_copy":
      collectCallees(node.dst, callees);
      collectCallees(node.src, callees);
      collectCallees(node.len, callees);
      break;
    case "memory_fill":
      collectCallees(node.dst, callees);
      collectCallees(node.val, callees);
      collectCallees(node.len, callees);
      break;
    case "memory_init":
      collectCallees(node.dst, callees);
      collectCallees(node.src, callees);
      collectCallees(node.len, callees);
      break;
    // Leaf nodes with no children: const_*, local_get, global_get, br, nop, unreachable, memory_size, data_drop
  }
}

/**
 * Builds a call graph from compiled function definitions.
 *
 * @param funcs - Array of compiled function definitions
 * @returns Map from function index to set of callee function indices
 */
export function buildCallGraph(funcs: FuncDef[]): Map<number, Set<number>> {
  const graph = new Map<number, Set<number>>();
  for (let i = 0; i < funcs.length; i++) {
    const callees = new Set<number>();
    for (const node of funcs[i]!.body) {
      collectCallees(node, callees);
    }
    graph.set(i, callees);
  }
  return graph;
}

/**
 * Finds functions involved in recursion (direct or indirect cycles).
 *
 * Uses DFS with coloring (white/gray/black) to detect back edges.
 *
 * @param graph - Call graph from {@link buildCallGraph}
 * @returns Set of function indices that participate in recursive cycles
 */
export function findRecursion(graph: Map<number, Set<number>>): Set<number> {
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<number, number>();
  const recursive = new Set<number>();
  const path: number[] = [];

  for (const node of graph.keys()) {
    color.set(node, WHITE);
  }

  function dfs(u: number): void {
    color.set(u, GRAY);
    path.push(u);
    const neighbors = graph.get(u);
    if (neighbors) {
      for (const v of neighbors) {
        if (!graph.has(v)) continue; // skip calls to imports (not in graph)
        const c = color.get(v) ?? WHITE;
        if (c === GRAY) {
          // Found a cycle — mark all nodes in the cycle
          const cycleStart = path.indexOf(v);
          for (let i = cycleStart; i < path.length; i++) {
            recursive.add(path[i]!);
          }
        } else if (c === WHITE) {
          dfs(v);
        }
      }
    }
    path.pop();
    color.set(u, BLACK);
  }

  for (const node of graph.keys()) {
    if (color.get(node) === WHITE) {
      dfs(node);
    }
  }

  return recursive;
}

/**
 * Finds functions that are not reachable from any export.
 *
 * @param graph - Call graph from {@link buildCallGraph}
 * @param exportIndices - Function indices that are exported
 * @returns Set of function indices that are unreachable from exports
 */
export function findUnusedFunctions(
  graph: Map<number, Set<number>>,
  exportIndices: number[],
): Set<number> {
  const reachable = new Set<number>();

  function visit(idx: number): void {
    if (reachable.has(idx)) return;
    reachable.add(idx);
    const callees = graph.get(idx);
    if (callees) {
      for (const callee of callees) {
        visit(callee);
      }
    }
  }

  for (const idx of exportIndices) {
    visit(idx);
  }

  const unused = new Set<number>();
  for (const idx of graph.keys()) {
    if (!reachable.has(idx)) {
      unused.add(idx);
    }
  }

  return unused;
}
