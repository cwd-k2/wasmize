import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem15_union_find(): Uint8Array {
  // Memory layout: parent at 0, rank at 32768, count at 65532
  const PARENT_BASE = 0;
  const RANK_BASE = 32768;
  const COUNT_ADDR = 65532;

  return compile(function* () {
    yield* Mod.memory(2);

    // uf_init(n): parent[i] = i, rank[i] = 0, count = n
    const uf_init = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);

      yield* i.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.ge(n));
          yield* Mem.store(i.mul(4).add(PARENT_BASE), i);
          yield* Mem.store(i.mul(4).add(RANK_BASE), 0);
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });
      yield* Mem.store(COUNT_ADDR, n);
    });

    // uf_find(x) -> root, with path compression
    let uf_find: import("../dsl/compiler").CallableFunc;
    uf_find = yield* Mod.func(function* () {
      const x = yield* param(Type.i32);
      const root = yield* local(Type.i32);
      const next = yield* local(Type.i32);

      yield* root.set(x);
      // Find root
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, root.eq(Mem.load(root.mul(4).add(PARENT_BASE))));
          yield* root.set(Mem.load(root.mul(4).add(PARENT_BASE)));
          yield* Ctrl.br(0);
        });
      });
      // Path compression
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, x.eq(root));
          yield* next.set(Mem.load(x.mul(4).add(PARENT_BASE)));
          yield* Mem.store(x.mul(4).add(PARENT_BASE), root);
          yield* x.set(next);
          yield* Ctrl.br(0);
        });
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

      yield* Ctrl.if(ru.ne(rv))
        .then(function* () {
          // Union by rank
          yield* Ctrl.if(Mem.load(ru.mul(4).add(RANK_BASE)).lt(Mem.load(rv.mul(4).add(RANK_BASE))))
            .then(function* () {
              yield* Mem.store(ru.mul(4).add(PARENT_BASE), rv);
            })
            .else(function* () {
              yield* Ctrl.if(Mem.load(ru.mul(4).add(RANK_BASE)).gt(Mem.load(rv.mul(4).add(RANK_BASE))))
                .then(function* () {
                  yield* Mem.store(rv.mul(4).add(PARENT_BASE), ru);
                })
                .else(function* () {
                  yield* Mem.store(rv.mul(4).add(PARENT_BASE), ru);
                  yield* Mem.store(ru.mul(4).add(RANK_BASE), Mem.load(ru.mul(4).add(RANK_BASE)).add(1));
                });
            });
          // Decrement count
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
