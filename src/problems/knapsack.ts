import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem10_knapsack(): Uint8Array {
  // Memory layout: weights at 0, values at 4096, DP at 8192
  const W_BASE = 0;
  const V_BASE = 4096;
  const DP_BASE = 8192;

  return compile(function* () {
    yield* Mod.memory(4);

    // knapsack(n, W) -> max value
    // 1D DP with reverse iteration: dp[w] = max value with capacity w
    const knapsack = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const cap = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const w = yield* local(Type.i32);
      const wi = yield* local(Type.i32);
      const vi = yield* local(Type.i32);
      const newVal = yield* local(Type.i32);

      // Initialize DP[0..cap] = 0
      yield* w.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, w.gt(cap));
          yield* Mem.store(w.mul(4).add(DP_BASE), 0);
          yield* w.set(w.add(1));
          yield* Ctrl.br(0);
        });
      });

      // For each item i
      yield* i.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.ge(n));

          yield* wi.set(Mem.load(i.mul(4).add(W_BASE)));
          yield* vi.set(Mem.load(i.mul(4).add(V_BASE)));

          // Reverse loop: w from cap down to wi
          yield* w.set(cap);
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              yield* Ctrl.br_if(1, w.lt(wi));

              // newVal = dp[w - wi] + vi
              yield* newVal.set(
                Mem.load(w.sub(wi).mul(4).add(DP_BASE)).add(vi),
              );
              // if newVal > dp[w], dp[w] = newVal
              yield* Ctrl.if(newVal.gt(Mem.load(w.mul(4).add(DP_BASE))))
                .then(function* () {
                  yield* Mem.store(w.mul(4).add(DP_BASE), newVal);
                });

              yield* w.set(w.sub(1));
              yield* Ctrl.br(0);
            });
          });

          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Return dp[cap]
      return yield* Mem.load(cap.mul(4).add(DP_BASE));
    });

    yield* Mod.export("knapsack", knapsack);
  });
}
