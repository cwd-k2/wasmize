import { local, Type, Mod, Op, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem10_knapsack() {
  const W_BASE = 0;
  const V_BASE = 4096;
  const DP_BASE = 8192;

  return compileWithWat<{ knapsack: (n: number, W: number) => number }>(function* () {
    yield* Mod.memory(4);
    const weights = Mem.i32Array(W_BASE);
    const values = Mem.i32Array(V_BASE);
    const dp = Mem.i32Array(DP_BASE);

    yield* Mod.exportFunc(
      "knapsack",
      { n: Type.i32, cap: Type.i32 },
      function* (n, cap) {
        const i = yield* local(Type.i32);
        const w = yield* local(Type.i32);
        const wi = yield* local(Type.i32);
        const vi = yield* local(Type.i32);

        yield* dp.fill(0, cap, 0);

        // For each item i
        yield* Ctrl.range(i, n, () => [
          wi.set(weights.load(i)),
          vi.set(values.load(i)),

          // Reverse loop: w from cap down to wi
          Ctrl.for(w, cap, w.ge(wi), w.sub(1), () => [
            dp.store(w, Op.max(dp.load(w), dp.load(w.sub(wi)).add(vi))),
          ]),
        ]);

        return yield* dp.load(cap);
      },
    );
  });
}
