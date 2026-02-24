/**
 * Memory bounds guard for development-time safety.
 *
 * {@link withBoundsCheck} wraps a function generator to inject `unreachable`
 * traps before any memory access where the address exceeds `maxBytes`.
 * Store operations are guarded at the statement level; load operations are
 * wrapped in conditional expressions. Nested loads within stores are also guarded.
 *
 * Designed for development use — remove `withBoundsCheck` in production
 * for zero overhead.
 *
 * @module
 */
import { IR, type IRNode } from "../wasm/ir";
import { visitChildren } from "../wasm/optimizer-passes";
import { interceptIR } from "./intercept";
import type { FuncGen, FuncReturn } from "./types";

const storeOps = new Set(["store_i32", "store_i32_8", "store_i64", "store_f64", "mem_store"]);

const loadOps = new Set(["load_i32", "load_i32_8u", "load_i64", "load_f64", "mem_load"]);

function getAddr(node: IRNode): IRNode | null {
  if ("addr" in node) return (node as { addr: IRNode }).addr;
  return null;
}

function wrapWithGuard(node: IRNode, maxBytes: number): IRNode {
  const addr = getAddr(node);
  if (!addr) return node;
  // if (addr >= maxBytes) unreachable; <original>
  return IR.seq([
    IR.if_then_else(IR.cmp("ge_u", addr, IR.const_i32(maxBytes)), [IR.unreachable()], [], "void"),
    node,
  ]);
}

function guardLoads(node: IRNode, maxBytes: number): IRNode {
  // First, recursively guard all child loads
  const visited = visitChildren(node, (child) => guardLoads(child, maxBytes));
  // Then guard this node if it's a load
  if (loadOps.has(visited.op)) {
    return wrapLoadWithGuard(visited, maxBytes);
  }
  return visited;
}

function wrapLoadWithGuard(node: IRNode, maxBytes: number): IRNode {
  const addr = getAddr(node);
  if (!addr) return node;
  // For loads (expression position), use select: if addr >= max, trap via unreachable in if
  // Since loads are in expression position, we use if-then-else with result type
  // The guard: if(addr >= maxBytes, unreachable, load)
  return IR.if_then_else(
    IR.cmp("ge_u", addr, IR.const_i32(maxBytes)),
    [IR.unreachable()],
    [node],
    "i32", // Result type matches load result; Wasm validates this
  );
}

/**
 * Wraps a function generator with memory bounds checking.
 * Injects `unreachable` traps before any memory access where addr >= maxBytes.
 *
 * - store_* operations are guarded at the stmt level
 * - load_* operations are guarded by wrapping in a conditional expression
 * - Remove `withBoundsCheck` for production builds (zero-overhead)
 */
export function* withBoundsCheck<T extends FuncReturn>(
  gen: FuncGen<T>,
  maxBytes: number,
): FuncGen<T> {
  return yield* interceptIR(gen, (node) => {
    // Guard store operations at stmt level
    if (storeOps.has(node.op)) {
      // Also guard any loads embedded in the store's value or address
      const guarded = visitChildren(node, (child) => guardLoads(child, maxBytes));
      return wrapWithGuard(guarded, maxBytes);
    }
    // Guard loads embedded in any stmt (e.g., local_set(_, load(...)))
    return guardLoads(node, maxBytes);
  });
}
