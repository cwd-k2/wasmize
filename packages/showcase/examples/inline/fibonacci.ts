import { wasmFunc } from "wasmize/inline";
import { locals, Type, Ctrl } from "wasmize/dsl/primitives";

/**
 * Fibonacci (iterative) via wasmFunc — Layer 3 API.
 *
 * Layer 1 (compile + Mod.exportFunc) だと ~25 行かかるセットアップが、
 * wasmFunc() なら params/result/body の 3 引数で完結する。
 * メモリ配列を使わず locals のみで O(1) space。
 */
export async function fibonacci() {
  return wasmFunc({ n: "i32" }, "i32", function* (n) {
    const [a, b, i, tmp] = yield* locals([Type.i32, 0], [Type.i32, 1], Type.i32, Type.i32);

    return yield* Ctrl.if(n.le(1))
      .then(function* () {
        return n;
      })
      .else(function* () {
        yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [tmp.set(a.add(b)), a.set(b), b.set(tmp)]);
        return b;
      });
  });
}
