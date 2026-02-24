import { compile, Type, Mod } from "wasmize/dsl/compiler";
import { sortWith } from "wasmize/stdlib/sort";
import { instantiate } from "wasmize/runtime/instantiate";

/**
 * stdlib の sortWith で call_indirect ベースの汎用ソート。
 *
 * コンパレータ関数をテーブルに登録し、インデックスで動的に切り替え。
 * Wasm の call_indirect 命令で関数ポインタ的なディスパッチを実現。
 *
 * - cmpIdx=0: 昇順 (a - b)
 * - cmpIdx=1: 降順 (b - a)
 */
export async function stdlibSort() {
  const binary = compile(function* () {
    yield* Mod.memory(1);

    // 昇順コンパレータ
    const ascCmp = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
      return yield* a.sub(b);
    });

    // 降順コンパレータ
    const descCmp = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
      return yield* b.sub(a);
    });

    // sortWith: テーブル + call_indirect ベースの quicksort
    const sort = yield* sortWith([ascCmp, descCmp]);

    yield* Mod.exportFunc(
      "sort",
      { lo: Type.i32, hi: Type.i32, cmpIdx: Type.i32 },
      function* (lo, hi, cmpIdx) {
        yield* sort.void(lo, hi, cmpIdx);
      },
    );
  });

  const { exports, mem } = await instantiate(binary);

  return {
    sort: exports.sort as (lo: number, hi: number, cmpIdx: number) => void,
    mem: mem!,
  };
}
