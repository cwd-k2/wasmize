import { wasmize } from "@/declarative";
import { local, Type, Op, Ctrl, Mem } from "@/dsl/primitives";

/**
 * Kadane's Algorithm via wasmize() — Layer 2 API.
 *
 * Layer 1 では手動で BASE オフセット計算 + instantiate + mem[base+i] 書き込みが必要。
 * wasmize() なら layout で宣言 → mod.layout.arr.set([...]) で書き込み → 関数呼出し。
 */
export async function kadane() {
  const mod = await wasmize({
    layout: {
      arr: { type: "i32" as const, count: 256 },
    },
    functions: {
      kadane: {
        params: { len: "i32" as const },
        body: function* (len) {
          // layout.arr は base 0 に配置される → Mem.i32Array() でアクセス
          const arr = Mem.i32Array();
          const i = yield* local(Type.i32);
          const current = yield* local(Type.i32);
          const best = yield* local(Type.i32);
          const v = yield* local(Type.i32);

          yield* current.set(arr.load(0));
          yield* best.set(current);

          yield* Ctrl.for(i, 1, i.lt(len), i.add(1), () => [
            v.set(arr.load(i)),
            current.set(Op.max(current.add(v), v)),
            best.set(Op.max(current, best)),
          ]);

          return best;
        },
      },
    },
  });

  return mod;
}
