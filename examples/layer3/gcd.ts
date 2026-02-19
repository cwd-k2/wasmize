import { wasmFunc } from "@/inline";
import { local, Type, Ctrl } from "@/dsl/primitives";

/**
 * GCD (Euclidean algorithm) via wasmFunc — Layer 3 API.
 *
 * 2 引数の純粋計算関数。wasmFunc() の最もシンプルなユースケース。
 * params は WasmRef<WasmValType> なので、IntType 制約のある .rem() を使うには
 * local(Type.i32, param) で型付きローカルにコピーする。
 */
export async function gcd() {
  return wasmFunc(
    { a: "i32", b: "i32" },
    "i32",
    function* (a, b) {
      const x = yield* local(Type.i32, a);
      const y = yield* local(Type.i32, b);
      const t = yield* local(Type.i32);

      yield* Ctrl.while(y.ne(0), () => [
        t.set(y),
        y.set(x.rem(y)),
        x.set(t),
      ]);

      return x;
    },
  );
}
