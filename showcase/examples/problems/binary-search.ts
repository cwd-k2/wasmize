/**
 * P5: Binary Search — find element in sorted array.
 *
 * Approach: Classic iterative binary search with lo/hi pointers.
 * Memory layout: sorted i32 array at offset 0.
 * Complexity: O(log n) time.
 * DSL features: Ctrl.while, Loc.return (early return), Mem.i32Array.
 */
import { local, Type, Mod, Mem, Ctrl, Loc } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem5_binary_search() {
  return compileWithWat<{
    binary_search: (len: number, target: number) => number;
    search_batch: (len: number, tbase: number, tcount: number) => number;
  }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // Single binary search
    const binary_search = yield* Mod.func(
      { len: Type.i32, target: Type.i32 },
      function* (len, target) {
        const lo = yield* local(Type.i32, 0);
        const hi = yield* local(Type.i32, len.sub(1));
        const mid = yield* local(Type.i32);
        const v = yield* local(Type.i32);

        yield* Ctrl.while(lo.le(hi), () => [
          mid.set(lo.add(hi).div(2)),
          v.set(arr.load(mid)),
          Ctrl.when(v.eq(target), () => [Loc.return(mid)]),
          Ctrl.if(v.lt(target))
            .then(function* () {
              yield* lo.set(mid.add(1));
            })
            .else(function* () {
              yield* hi.set(mid.sub(1));
            }),
        ]);

        return -1;
      },
    );

    // Batch search: loop targets inside Wasm (eliminates per-call JS↔Wasm overhead)
    const search_batch = yield* Mod.func(
      { len: Type.i32, tbase: Type.i32, tcount: Type.i32 },
      function* (len, tbase, tcount) {
        const ti = yield* local(Type.i32);
        const sum = yield* local(Type.i32, 0);

        yield* Ctrl.range(ti, tcount, () => [
          sum.incrBy(binary_search(len, Mem.load(tbase.add(ti.mul(4))))),
        ]);

        return sum;
      },
    );

    yield* Mod.exportAll({ binary_search, search_batch });
  });
}
