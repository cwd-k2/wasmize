import { compile, local, Type, Mod, Op, Ctrl, Mem } from "../dsl/compiler";

export function problem9_lcs() {
  const A_BASE = 0;
  const B_BASE = 1024;
  const DP_BASE = 2048;

  return compile<{ lcs: (la: number, lb: number) => number }>(function* () {
    yield* Mod.memory(5);
    const a = Mem.i32Array(A_BASE);
    const b = Mem.i32Array(B_BASE);

    yield* Mod.exportFunc("lcs", { len_a: Type.i32, len_b: Type.i32 }, function* (len_a, len_b) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const cols = yield* local(Type.i32, len_b.add(1));
      const cols4 = yield* local(Type.i32);
      const prevRow = yield* local(Type.i32);
      const currRow = yield* local(Type.i32);

      yield* cols4.set(cols.mul(4));

      // Initialize DP[0][j] = 0 (first row)
      yield* Ctrl.for(j, 0, j.le(len_b), j.add(1), () => [
        Mem.store(Mem.i32(DP_BASE).add(j.mul(4)), 0),
      ]);
      // Initialize DP[i][0] = 0 (first column)
      yield* Ctrl.for(i, 0, i.le(len_a), i.add(1), () => [
        Mem.store(Mem.i32(DP_BASE).add(i.mul(cols4)), 0),
      ]);

      // Fill DP table — pre-computed row offsets eliminate row*cols mul
      yield* Ctrl.for(i, 1, i.le(len_a), i.add(1), function* () {
        yield* prevRow.set(i.sub(1).mul(cols4).add(DP_BASE));
        yield* currRow.set(i.mul(cols4).add(DP_BASE));

        yield* Ctrl.for(j, 1, j.le(len_b), j.add(1), function* () {
          yield* Ctrl.if(a.load(i.sub(1)).eq(b.load(j.sub(1))))
            .then(function* () {
              yield* Mem.store(
                currRow.add(j.mul(4)),
                Mem.load(prevRow.add(j.sub(1).mul(4))).add(1),
              );
            })
            .else(function* () {
              yield* Mem.store(
                currRow.add(j.mul(4)),
                Op.max(
                  Mem.load(prevRow.add(j.mul(4))),
                  Mem.load(currRow.add(j.sub(1).mul(4))),
                ),
              );
            });
        });
      });

      return yield* Mem.load(len_a.mul(cols4).add(len_b.mul(4)).add(DP_BASE));
    });
  });
}
