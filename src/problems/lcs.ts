import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem9_lcs(): Uint8Array {
  // Memory layout: A at 0, B at 1024, DP at 2048
  const A_BASE = 0;
  const B_BASE = 1024;
  const DP_BASE = 2048;

  return compile(function* () {
    yield* Mod.memory(5);

    // lcs(len_a, len_b) -> LCS length
    const lcs = yield* Mod.func(function* () {
      const len_a = yield* param(Type.i32);
      const len_b = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const cols = yield* local(Type.i32); // len_b + 1

      yield* cols.set(len_b.add(1));

      // Initialize DP[0][j] = 0 and DP[i][0] = 0 (already zero in fresh memory)
      // But we clear row 0 and column 0 explicitly for re-entrancy
      yield* i.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.gt(len_a));
          yield* Mem.store(i.mul(cols).mul(4).add(DP_BASE), 0);
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });
      yield* j.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, j.gt(len_b));
          yield* Mem.store(j.mul(4).add(DP_BASE), 0);
          yield* j.set(j.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Fill DP table
      yield* i.set(1);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.gt(len_a));

          yield* j.set(1);
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              yield* Ctrl.br_if(1, j.gt(len_b));

              // if A[i-1] == B[j-1]
              yield* Ctrl.if(
                Mem.load(i.sub(1).mul(4).add(A_BASE))
                  .eq(Mem.load(j.sub(1).mul(4).add(B_BASE))),
              )
                .then(function* () {
                  // DP[i][j] = DP[i-1][j-1] + 1
                  yield* Mem.store(
                    i.mul(cols).add(j).mul(4).add(DP_BASE),
                    Mem.load(i.sub(1).mul(cols).add(j.sub(1)).mul(4).add(DP_BASE)).add(1),
                  );
                })
                .else(function* () {
                  // DP[i][j] = max(DP[i-1][j], DP[i][j-1])
                  yield* Ctrl.if(
                    Mem.load(i.sub(1).mul(cols).add(j).mul(4).add(DP_BASE))
                      .ge(Mem.load(i.mul(cols).add(j.sub(1)).mul(4).add(DP_BASE))),
                  )
                    .then(function* () {
                      yield* Mem.store(
                        i.mul(cols).add(j).mul(4).add(DP_BASE),
                        Mem.load(i.sub(1).mul(cols).add(j).mul(4).add(DP_BASE)),
                      );
                    })
                    .else(function* () {
                      yield* Mem.store(
                        i.mul(cols).add(j).mul(4).add(DP_BASE),
                        Mem.load(i.mul(cols).add(j.sub(1)).mul(4).add(DP_BASE)),
                      );
                    });
                });

              yield* j.set(j.add(1));
              yield* Ctrl.br(0);
            });
          });

          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Return DP[len_a][len_b]
      return yield* Mem.load(len_a.mul(cols).add(len_b).mul(4).add(DP_BASE));
    });

    yield* Mod.export("lcs", lcs);
  });
}
