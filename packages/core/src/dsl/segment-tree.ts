/**
 * Iterative (bottom-up) segment tree for range sum queries.
 *
 * Generator factory pattern: `const st = yield* SegmentTree(base, n)`
 * allocates internal locals and returns a handle with
 * `build`/`query`/`update` operations.
 *
 * Memory layout: 2n i32 words at `base` (indices 1..2n-1 used,
 * index 0 unused). Leaves are at positions n..2n-1, internal
 * nodes at 1..n-1.
 *
 * @param base - Base byte offset for the tree's backing i32 array
 * @param n - Number of elements (should be a power of 2 for simplicity)
 *
 * @module
 */
import type { FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set, resolve } from "./expr";
import { Mem, Ctrl, Loc } from "./namespaces";
import { local, Type } from "./declarations";

export interface SegmentTreeHandle {
  /** Builds the tree from a source i32 array at srcBase (n elements). */
  build(srcBase: ExprInput): FuncGen<void>;
  /** Returns the sum of range [l, r) as a ChainableExpr. */
  query(l: ExprInput, r: ExprInput): FuncGen<import("./types").WasmVal>;
  /** Point update: sets element at idx to val and propagates up. */
  update(idx: ExprInput, val: ExprInput): FuncGen<void>;
}

/**
 * Creates an iterative bottom-up segment tree backed by linear memory.
 *
 * @param base - Base byte offset for 2n i32 words
 * @param n - Number of leaf elements
 */
export function* SegmentTree(
  base: ExprInput,
  n: number,
): Generator<any, SegmentTreeHandle, any> {
  const tree = Mem.i32Array(base);
  const idx = yield* local(Type.i32);
  const l_ = yield* local(Type.i32);
  const r_ = yield* local(Type.i32);
  const sum = yield* local(Type.i32, 0);

  return {
    build(srcBase: ExprInput): FuncGen<void> {
      const src = Mem.i32Array(srcBase);
      return (function* () {
        // Copy source data to leaves: tree[n + i] = src[i]
        yield* Ctrl.range(idx, n, () => [
          tree.store(idx.add(n), src.load(idx)),
        ]);
        // Build internal nodes from bottom up: tree[i] = tree[2i] + tree[2i+1]
        yield* Ctrl.for(idx, n - 1, idx.gt(0), idx.sub(1), () => [
          tree.store(idx, tree.load(idx.mul(2)).add(tree.load(idx.mul(2).add(1)))),
        ]);
      })();
    },

    query(l: ExprInput, r: ExprInput): FuncGen<import("./types").WasmVal> {
      return (function* () {
        // Convert to tree indices: l += n, r += n
        yield* set(l_, new ChainableExpr(resolve(l)).add(n));
        yield* set(r_, new ChainableExpr(resolve(r)).add(n));
        yield* set(sum, 0);

        // Iterative query: while l < r
        yield* Ctrl.while(l_.lt(r_), function* () {
          // If l is a right child, include it and move right
          yield* Ctrl.when(l_.and(1), () => [
            sum.incrBy(tree.load(l_)),
            l_.incrBy(1),
          ]);
          // If r is a right child, move left and include it
          yield* Ctrl.when(r_.and(1), () => [
            r_.decrBy(1),
            sum.incrBy(tree.load(r_)),
          ]);
          // Move up
          yield* l_.shrBy(1);
          yield* r_.shrBy(1);
        });
        return yield* Loc.get(sum);
      })();
    },

    update(i: ExprInput, val: ExprInput): FuncGen<void> {
      return (function* () {
        // Set leaf: tree[n + i] = val
        yield* set(idx, new ChainableExpr(resolve(i)).add(n));
        yield* tree.store(idx, val);
        // Propagate up
        yield* idx.shrBy(1);
        yield* Ctrl.while(idx.gt(0), () => [
          tree.store(idx, tree.load(idx.mul(2)).add(tree.load(idx.mul(2).add(1)))),
          idx.shrBy(1),
        ]);
      })();
    },
  };
}
