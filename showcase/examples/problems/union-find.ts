/**
 * P15: Union-Find — disjoint set with path compression and union by rank.
 *
 * Approach: Self-contained UnionFind data structure (plain function pattern).
 * Uses BumpAllocator for automatic memory layout, Mem.i32Array for parent/rank arrays.
 * find uses path halving (single-pass), union uses rank-based merge with elseif chain.
 * Complexity: O(α(n)) amortized per operation.
 * DSL features: BumpAllocator, Mem.i32Array, Ctrl.while, Ctrl.if.elseif, Ctrl.range.
 */
import {
  local,
  Type,
  Mod,
  Mem,
  Ctrl,
  type ExprInput,
  type FuncGen,
  WasmRef,
} from "@/dsl/compiler";
import { BumpAllocator } from "@/dsl/allocator";
import { compileWithWat } from "@/debug";

// --- UnionFind data structure (plain function pattern) ---

function UnionFind(alloc: BumpAllocator, maxN: number) {
  const parent = alloc.i32Array(maxN);
  const rank = alloc.i32Array(maxN);
  const countAddr = alloc.alloc(4, 4);

  /** Path-halving find: mutates x in-place to its root. */
  function find(x: WasmRef<"i32">): FuncGen<void> {
    return (function* () {
      yield* Ctrl.while(x.ne(parent.load(x)), function* () {
        yield* parent.store(x, parent.load(parent.load(x)));
        yield* x.set(parent.load(x));
      });
    })();
  }

  return {
    /** Initializes parent[i]=i, rank[i]=0, count=n for i in [0, n). */
    init(n: ExprInput): FuncGen<void> {
      return (function* () {
        const i = yield* local(Type.i32);
        yield* Ctrl.range(i, n, () => [parent.store(i, i), rank.store(i, 0)]);
        yield* Mem.store(countAddr, n);
      })();
    },

    find,

    /** Union by rank. Merges the sets containing u and v. */
    union(u: WasmRef<"i32">, v: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* find(u);
        yield* find(v);
        yield* Ctrl.when(u.ne(v), function* () {
          yield* Ctrl.if(rank.load(u).lt(rank.load(v)))
            .then(function* () {
              yield* parent.store(u, v);
            })
            .elseif(rank.load(u).gt(rank.load(v)))
            .then(function* () {
              yield* parent.store(v, u);
            })
            .else(function* () {
              yield* parent.store(v, u);
              yield* rank.store(u, rank.load(u).add(1));
            });
          yield* Mem.store(countAddr, Mem.load(countAddr).sub(1));
        });
      })();
    },

    /** Number of disjoint sets (ChainableExpr). */
    get count() {
      return Mem.load(countAddr);
    },
  };
}

// --- Wasm module ---

export function problem15_union_find() {
  const alloc = new BumpAllocator();
  const uf = UnionFind(alloc, 8192);

  return compileWithWat<{
    uf_init: (n: number) => void;
    uf_union: (u: number, v: number) => void;
    uf_find: (x: number) => number;
    uf_count: () => number;
  }>(function* () {
    yield* Mod.memory(alloc.requiredPages);

    const uf_init = yield* Mod.func({ n: Type.i32 }, function* (n) {
      yield* uf.init(n);
    });

    const uf_find = yield* Mod.func({ x: Type.i32 }, function* (x) {
      yield* uf.find(x);
      return x;
    });

    const uf_union = yield* Mod.func(
      { u: Type.i32, v: Type.i32 },
      function* (u, v) {
        yield* uf.union(u, v);
      },
    );

    const uf_count = yield* Mod.func(function* () {
      return yield* uf.count;
    });

    yield* Mod.exportAll({ uf_init, uf_find, uf_union, uf_count });
  });
}
