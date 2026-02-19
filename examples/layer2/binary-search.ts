import { wasmize } from "@/declarative";
import { local, Type, Ctrl, Loc, Mem } from "@/dsl/primitives";

/**
 * Binary Search via wasmize() — Layer 2 API.
 *
 * ソート済み配列を layout.data にセットし、binary_search(len, target) で検索。
 * 見つかればインデックス、見つからなければ -1 を返す。
 */
export async function binarySearch() {
  const mod = await wasmize({
    layout: {
      data: { type: "i32" as const, count: 1024 },
    },
    functions: {
      binary_search: {
        params: { len: "i32" as const, target: "i32" as const },
        body: function* (len, target) {
          const arr = Mem.i32Array();
          const lo = yield* local(Type.i32, 0);
          const hi = yield* local(Type.i32, len.sub(1));
          const mid = yield* local(Type.i32);
          const v = yield* local(Type.i32);

          yield* Ctrl.while(lo.le(hi), () => [
            mid.set(lo.add(hi).div(2)),
            v.set(arr.load(mid)),
            Ctrl.when(v.eq(target), () => [
              Loc.return(mid),
            ]),
            Ctrl.if(v.lt(target))
              .then(function* () { yield* lo.set(mid.add(1)); })
              .else(function* () { yield* hi.set(mid.sub(1)); }),
          ]);

          return -1;
        },
      },
    },
  });

  return mod;
}
