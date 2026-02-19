import { wasmFunc } from "@/inline";
import { local, Type, Ctrl } from "@/dsl/primitives";

/**
 * Fibonacci (iterative) via wasmFunc — Layer 3 API.
 *
 * Layer 1 (compile + Mod.exportFunc) だと ~25 行かかるセットアップが、
 * wasmFunc() なら params/result/body の 3 引数で完結する。
 * メモリ配列を使わず locals のみで O(1) space。
 */
export async function fibonacci() {
  return wasmFunc(
    { n: "i32" },
    "i32",
    function* (n) {
      const a = yield* local(Type.i32, 0);
      const b = yield* local(Type.i32, 1);
      const i = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);

      return yield* Ctrl.if(n.le(1))
        .then(function* () {
          return n;
        })
        .else(function* () {
          yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
            tmp.set(a.add(b)),
            a.set(b),
            b.set(tmp),
          ]);
          return b;
        });
    },
  );
}
