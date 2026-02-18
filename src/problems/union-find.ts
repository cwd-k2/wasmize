import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";
import { type CallableFunc } from "../dsl/compiler";

export function problem15_union_find() {
  const PARENT_BASE = 0;
  const RANK_BASE = 32768;
  const COUNT_ADDR = 65532;

  return compile<{
    uf_init: (n: number) => void;
    uf_union: (u: number, v: number) => void;
    uf_find: (x: number) => number;
    uf_count: () => number;
  }>(function* () {
    yield* Mod.memory(2);
    const parent = Mem.i32Array(PARENT_BASE);
    const rank = Mem.i32Array(RANK_BASE);

    // uf_init(n): parent[i] = i, rank[i] = 0, count = n
    const uf_init = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);

      yield* Ctrl.for(i, 0, i.lt(n), i.add(1), function* () {
        yield* parent.store(i, i);
        yield* rank.store(i, 0);
      });
      yield* Mem.store(COUNT_ADDR, n);
    });

    // uf_find(x) -> root, with path compression
    let uf_find: CallableFunc;
    uf_find = yield* Mod.func(function* () {
      const x = yield* param(Type.i32);
      const root = yield* local(Type.i32);
      const next = yield* local(Type.i32);

      yield* root.set(x);
      // Find root
      yield* Ctrl.while(root.ne(parent.load(root)), function* () {
        yield* root.set(parent.load(root));
      });
      // Path compression
      yield* Ctrl.while(x.ne(root), function* () {
        yield* next.set(parent.load(x));
        yield* parent.store(x, root);
        yield* x.set(next);
      });

      return yield* Loc.get(root);
    });

    // uf_union(u, v): union by rank
    const uf_union = yield* Mod.func(function* () {
      const u = yield* param(Type.i32);
      const v = yield* param(Type.i32);
      const ru = yield* local(Type.i32);
      const rv = yield* local(Type.i32);

      yield* ru.set(uf_find(u));
      yield* rv.set(uf_find(v));

      yield* Ctrl.when(ru.ne(rv), function* () {
        yield* Ctrl.if(rank.load(ru).lt(rank.load(rv)))
          .then(function* () {
            yield* parent.store(ru, rv);
          })
          .else(function* () {
            yield* Ctrl.if(rank.load(ru).gt(rank.load(rv)))
              .then(function* () {
                yield* parent.store(rv, ru);
              })
              .else(function* () {
                yield* parent.store(rv, ru);
                yield* rank.store(ru, rank.load(ru).add(1));
              });
          });
        yield* Mem.store(COUNT_ADDR, Mem.load(COUNT_ADDR).sub(1));
      });
    });

    // uf_count() -> number of disjoint sets
    const uf_count = yield* Mod.func(function* () {
      return yield* Mem.load(COUNT_ADDR);
    });

    yield* Mod.export("uf_init", uf_init);
    yield* Mod.export("uf_find", uf_find);
    yield* Mod.export("uf_union", uf_union);
    yield* Mod.export("uf_count", uf_count);
  });
}
