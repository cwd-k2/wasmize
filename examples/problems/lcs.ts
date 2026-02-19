import { local, Type, Mod, Op, Ctrl, Mem } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem9_lcs() {
  const A_BASE = 0;
  const B_BASE = 1024;
  const DP_BASE = 2048;

  return compileWithWat<{ lcs: (la: number, lb: number) => number }>(function* () {
    yield* Mod.memory(5);
    const a = Mem.i32Array(A_BASE);
    const b = Mem.i32Array(B_BASE);

    yield* Mod.exportFunc("lcs", { len_a: Type.i32, len_b: Type.i32 }, function* (len_a, len_b) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const cols = yield* local(Type.i32, len_b.add(1));
      const dp = Mem.i32Array2D(DP_BASE, cols);

      // Initialize DP[0][j] = 0 (first row)
      yield* Ctrl.range(j, cols, () => [dp.store(0, j, 0)]);
      // Initialize DP[i][0] = 0 (first column)
      yield* Ctrl.range(i, len_a.add(1), () => [dp.store(i, 0, 0)]);

      // Fill DP table
      yield* Ctrl.range(i, 1, len_a.add(1), function* () {
        yield* Ctrl.range(j, 1, len_b.add(1), function* () {
          yield* Ctrl.if(a.load(i.sub(1)).eq(b.load(j.sub(1))))
            .then(function* () {
              yield* dp.store(i, j, dp.load(i.sub(1), j.sub(1)).add(1));
            })
            .else(function* () {
              yield* dp.store(
                i, j,
                Op.max(dp.load(i.sub(1), j), dp.load(i, j.sub(1))),
              );
            });
        });
      });

      return yield* dp.load(len_a, len_b);
    });
  });
}
