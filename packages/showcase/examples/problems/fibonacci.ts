/**
 * P2: Fibonacci — bottom-up dynamic programming.
 *
 * Approach: Iterative DP, storing results in linear memory i32 array.
 * Memory layout: i32 array at offset 0, dp[i] = fib(i).
 * Complexity: O(n) time, O(n) space.
 * DSL features: Mem.i32Array, Ctrl.range, local variables.
 */
import { local, Type, Mod, Mem, Ctrl } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";

export function problem2_fib_dp() {
  return compileWithWat<{ fib: (n: number) => number }>(function* () {
    const arr = Mem.i32Array();

    yield* Mod.exportFunc("fib", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);

      yield* arr.store(0, 0);
      yield* arr.store(1, 1);

      return yield* Ctrl.if(n.le(1))
        .then(function* () {
          return yield* arr.load(n);
        })
        .else(function* () {
          yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
            arr.store(i, arr.load(i.sub(1)).add(arr.load(i.sub(2)))),
          ]);
          return yield* arr.load(n);
        });
    });
  });
}
