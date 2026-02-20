import { local, i32, Type, Mod, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem14_nqueens() {
  return compileWithWat<{ nqueens: (n: number) => number }>(function* () {
    yield* Mod.memory(1);

    // solve(n, row, cols, diag1, diag2) -> count of solutions
    const solve = yield* Mod.recursive(
      { n: Type.i32, row: Type.i32, cols: Type.i32, diag1: Type.i32, diag2: Type.i32 },
      function* (self, n, row, cols, diag1, diag2) {
        const count = yield* local(Type.i32, 0);
        const col = yield* local(Type.i32);
        const bit = yield* local(Type.i32);
        const d1bit = yield* local(Type.i32);
        const d2bit = yield* local(Type.i32);

        return yield* Ctrl.if(row.ge(n))
          .then(function* () {
            return 1;
          })
          .else(function* () {
            yield* Ctrl.range(col, n, () => [
              bit.set(i32(1).shl(col)),
              d1bit.set(i32(1).shl(row.add(col))),
              d2bit.set(i32(1).shl(row.sub(col).add(n.sub(1)))),

              Ctrl.when(
                cols.and(bit).eq(0).and(diag1.and(d1bit).eq(0)).and(diag2.and(d2bit).eq(0)),
                () => [
                  count.incrBy(self(n, row.add(1), cols.or(bit), diag1.or(d1bit), diag2.or(d2bit))),
                ],
              ),
            ]);

            return count;
          });
      },
    );

    // nqueens(n) -> total solutions
    yield* Mod.exportFunc("nqueens", { n: Type.i32 }, function* (n) {
      return yield* solve(n, 0, 0, 0, 0);
    });
  });
}
