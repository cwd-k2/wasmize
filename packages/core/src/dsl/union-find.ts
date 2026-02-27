import type { WasmRef, FuncGen, WasmVal } from "./types";
import { type ExprInput, ChainableExpr, set, resolve } from "./expr";
import { Mem, Ctrl } from "./namespaces";
import { local, Type } from "./declarations";

export interface UnionFindHandle {
  /** Initializes 0..n-1 as individual sets: parent[i]=i, rank[i]=0. */
  init(n: ExprInput): FuncGen<void>;
  /** Finds the root of x with path compression, stores result in dst. */
  find(x: ExprInput, dst: WasmRef<"i32">): FuncGen<void>;
  /** Merges the sets containing x and y (union by rank). */
  union(x: ExprInput, y: ExprInput): FuncGen<void>;
  /** Returns 1 if x and y are in the same set, 0 otherwise. */
  same(x: ExprInput, y: ExprInput): FuncGen<WasmVal>;
}

/**
 * Creates a Union-Find (disjoint set) data structure backed by linear memory.
 *
 * Memory layout: two parallel i32 arrays:
 * - parent: `base` (i32 x capacity)
 * - rank:   `base + capacity*4` (i32 x capacity)
 *
 * @param base - Base byte offset
 * @param capacity - Maximum number of elements
 */
export function* UnionFind(
  base: ExprInput,
  capacity: number,
): Generator<any, UnionFindHandle, any> {
  const cur: WasmRef<"i32"> = yield* local(Type.i32);
  const rootX: WasmRef<"i32"> = yield* local(Type.i32);
  const rootY: WasmRef<"i32"> = yield* local(Type.i32);

  const parent = Mem.i32Array(base);
  // Rank array starts at base + capacity * 4 bytes
  const rankBase =
    typeof base === "number"
      ? base + capacity * 4
      : new ChainableExpr(resolve(base)).add(capacity * 4);
  const rankArr = Mem.i32Array(rankBase);

  // Internal find: path-halving, stores root in `cur`
  function findRoot(x: ExprInput): FuncGen<void> {
    return (function* () {
      yield* set(cur, x);
      // Path halving: while cur != parent[cur], set parent[cur] = parent[parent[cur]], then cur = parent[cur]
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.when(cur.eq(parent.load(cur)), function* () {
            yield* Ctrl.br(2);
          });
          // Path compression: point to grandparent
          yield* parent.store(cur, parent.load(parent.load(cur)));
          yield* cur.set(parent.load(cur));
          yield* Ctrl.br(0);
        });
      });
    })();
  }

  return {
    init(n: ExprInput): FuncGen<void> {
      return (function* () {
        const i: WasmRef<"i32"> = yield* local(Type.i32);
        yield* Ctrl.range(i, n, () => [
          parent.store(i, i),
          rankArr.store(i, 0),
        ]);
      })();
    },

    find(x: ExprInput, dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* findRoot(x);
        yield* set(dst, cur);
      })();
    },

    union(x: ExprInput, y: ExprInput): FuncGen<void> {
      return (function* () {
        // Find roots
        yield* findRoot(x);
        yield* set(rootX, cur);
        yield* findRoot(y);
        yield* set(rootY, cur);

        // If same root, nothing to do
        yield* Ctrl.when(rootX.ne(rootY), function* () {
          // Union by rank
          yield* Ctrl.if(rankArr.load(rootX).lt(rankArr.load(rootY)))
            .then(() => [parent.store(rootX, rootY)])
            .elseif(rankArr.load(rootX).gt(rankArr.load(rootY)))
            .then(() => [parent.store(rootY, rootX)])
            .else(() => [
              parent.store(rootY, rootX),
              rankArr.store(rootX, rankArr.load(rootX).add(1)),
            ]);
        });
      })();
    },

    same(x: ExprInput, y: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        yield* findRoot(x);
        yield* set(rootX, cur);
        yield* findRoot(y);
        yield* set(rootY, cur);
        return yield* rootX.eq(rootY);
      })();
    },
  };
}
