/**
 * P13: Longest Increasing Subsequence — patience sorting approach.
 *
 * Approach: Binary search on tails array for O(n log n) LIS.
 * Memory layout: input at offset 0, tails array at TAILS_BASE.
 * Complexity: O(n log n) time, O(n) space.
 * DSL features: Mem.i32Array, Ctrl.while (binary search inner loop).
 */
import { locals, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem13_lis() {
  const TAILS_BASE = 65536;

  return compileWithWat<{ lis: (len: number) => number }>(function* () {
    yield* Mod.memory(2);
    const input = Mem.i32Array();
    const tails = Mem.i32Array(TAILS_BASE);

    // lis(len) -> LIS length — binary search inlined to avoid function call overhead
    yield* Mod.exportFunc("lis", { len: Type.i32 }, function* (len) {
      const [i, tails_len, lo, hi, mid, val] =
        yield* locals(Type.i32, [Type.i32, 0], Type.i32, Type.i32, Type.i32, Type.i32);

      yield* Ctrl.range(i, len, function* () {
        yield* val.set(input.load(i));

        // Inline lower_bound: find first index where tails[idx] >= val
        yield* lo.set(0);
        yield* hi.set(tails_len);
        yield* Ctrl.while(lo.lt(hi), function* () {
          yield* mid.set(lo.add(hi).div(2));
          yield* Ctrl.if(tails.load(mid).lt(val))
            .then(function* () {
              yield* lo.set(mid.add(1));
            })
            .else(function* () {
              yield* hi.set(mid);
            });
        });

        yield* tails.store(lo, val);
        yield* Ctrl.when(lo.eq(tails_len), () => [tails_len.incrBy(1)]);
      });

      return tails_len;
    });
  });
}
