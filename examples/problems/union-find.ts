import { compile, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";

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
    const uf_init = yield* Mod.func({ n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);

      yield* Ctrl.for(i, 0, i.lt(n), i.add(1), () => [
        parent.store(i, i),
        rank.store(i, 0),
      ]);
      yield* Mem.store(COUNT_ADDR, n);
    });

    // uf_find(x) -> root, with path halving (single-pass)
    const uf_find = yield* Mod.func({ x: Type.i32 }, function* (x) {
      yield* Ctrl.while(x.ne(parent.load(x)), function* () {
        yield* parent.store(x, parent.load(parent.load(x)));
        yield* x.set(parent.load(x));
      });
      return x;
    });

    // uf_union(u, v): union by rank
    const uf_union = yield* Mod.func({ u: Type.i32, v: Type.i32 }, function* (u, v) {
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

    yield* Mod.exportAll({ uf_init, uf_find, uf_union, uf_count });
  });
}
