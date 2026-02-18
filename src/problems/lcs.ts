import { compile, param, local, Type, Mod, Op, Ctrl } from "../dsl/compiler";
import { Mem } from "../dsl/compiler";

export function problem9_lcs() {
  const A_BASE = 0;
  const B_BASE = 1024;
  const DP_BASE = 2048;

  return compile<{ lcs: (la: number, lb: number) => number }>(function* () {
    yield* Mod.memory(5);
    const a = Mem.i32Array(A_BASE);
    const b = Mem.i32Array(B_BASE);

    const lcs = yield* Mod.func(function* () {
      const len_a = yield* param(Type.i32);
      const len_b = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const cols = yield* local(Type.i32, len_b.add(1));
      const dp = Mem.i32Array2D(DP_BASE, cols);

      // Initialize DP[0][j] = 0 and DP[i][0] = 0
      yield* Ctrl.for(i, 0, i.le(len_a), i.add(1), function* () {
        yield* dp.store(i, 0, 0);
      });
      yield* Ctrl.for(j, 0, j.le(len_b), j.add(1), function* () {
        yield* dp.store(0, j, 0);
      });

      // Fill DP table
      yield* Ctrl.for(i, 1, i.le(len_a), i.add(1), function* () {
        yield* Ctrl.for(j, 1, j.le(len_b), j.add(1), function* () {
          yield* Ctrl.if(a.load(i.sub(1)).eq(b.load(j.sub(1))))
            .then(function* () {
              yield* dp.store(i, j, dp.load(i.sub(1), j.sub(1)).add(1));
            })
            .else(function* () {
              yield* dp.store(i, j, Op.max(dp.load(i.sub(1), j), dp.load(i, j.sub(1))));
            });
        });
      });

      return yield* dp.load(len_a, len_b);
    });

    yield* Mod.export("lcs", lcs);
  });
}
