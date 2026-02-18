import {
  compile,
  param,
  local,
  Type,
  Mod,
  Mem,
  Ctrl,
  Loc,
  type CallableFunc,
} from "../dsl/compiler";

export function problem14_nqueens() {
  return compile<{ nqueens: (n: number) => number }>(function* () {
    yield* Mod.memory(1);

    // solve(n, row, cols, diag1, diag2) -> count of solutions
    let solve: CallableFunc;
    solve = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const row = yield* param(Type.i32);
      const cols = yield* param(Type.i32);
      const diag1 = yield* param(Type.i32);
      const diag2 = yield* param(Type.i32);
      const count = yield* local(Type.i32, 0);
      const col = yield* local(Type.i32);
      const bit = yield* local(Type.i32);
      const d1bit = yield* local(Type.i32);
      const d2bit = yield* local(Type.i32);

      return yield* Ctrl.if(row.ge(n))
        .then(function* () {
          return yield* Mem.i32(1);
        })
        .else(function* () {
          yield* Ctrl.for(col, 0, col.lt(n), col.add(1), function* () {
            yield* bit.set(Mem.i32(1).shl(col));
            yield* d1bit.set(Mem.i32(1).shl(row.add(col)));
            yield* d2bit.set(Mem.i32(1).shl(row.sub(col).add(n.sub(1))));

            yield* Ctrl.when(
              cols.and(bit).eq(0)
                .and(diag1.and(d1bit).eq(0))
                .and(diag2.and(d2bit).eq(0)),
              function* () {
                yield* count.set(
                  count.add(
                    solve(
                      n,
                      row.add(1),
                      cols.or(bit),
                      diag1.or(d1bit),
                      diag2.or(d2bit),
                    ),
                  ),
                );
              },
            );
          });

          return yield* Loc.get(count);
        });
    });

    // nqueens(n) -> total solutions
    const nqueens = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      return yield* solve(n, Mem.i32(0), Mem.i32(0), Mem.i32(0), Mem.i32(0));
    });

    yield* Mod.export("nqueens", nqueens);
  });
}
