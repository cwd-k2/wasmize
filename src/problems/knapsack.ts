import { compile, param, local, Type, Mod, Ctrl } from "../dsl/compiler";
import { Mem } from "../dsl/compiler";

export function problem10_knapsack() {
  const W_BASE = 0;
  const V_BASE = 4096;
  const DP_BASE = 8192;

  return compile<{ knapsack: (n: number, W: number) => number }>(function* () {
    yield* Mod.memory(4);
    const weights = Mem.i32Array(W_BASE);
    const values = Mem.i32Array(V_BASE);
    const dp = Mem.i32Array(DP_BASE);

    const knapsack = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const cap = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const w = yield* local(Type.i32);
      const wi = yield* local(Type.i32);
      const vi = yield* local(Type.i32);
      const newVal = yield* local(Type.i32);

      // Initialize DP[0..cap] = 0
      yield* Ctrl.for(w, 0, w.le(cap), w.add(1), function* () {
        yield* dp.store(w, 0);
      });

      // For each item i
      yield* Ctrl.for(i, 0, i.lt(n), i.add(1), function* () {
        yield* wi.set(weights.load(i));
        yield* vi.set(values.load(i));

        // Reverse loop: w from cap down to wi
        yield* Ctrl.for(w, cap, w.ge(wi), w.sub(1), function* () {
          yield* newVal.set(dp.load(w.sub(wi)).add(vi));
          yield* Ctrl.when(newVal.gt(dp.load(w)), function* () {
            yield* dp.store(w, newVal);
          });
        });
      });

      return yield* dp.load(cap);
    });

    yield* Mod.export("knapsack", knapsack);
  });
}
