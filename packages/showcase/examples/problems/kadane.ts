/**
 * P3: Kadane's Algorithm — maximum subarray sum.
 *
 * Approach: Single-pass scan tracking current and global max.
 * Memory layout: input array at offset 1024 (i32 elements).
 * Complexity: O(n) time, O(1) extra space.
 * DSL features: Op.max (branchless select), Ctrl.range.
 */
import { locals, Type, Mod, Op, Mem, Ctrl } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";

export function problem3_kadane() {
  const BASE = 1024;
  return compileWithWat<{ kadane: (len: number) => number }>(function* () {
    yield* Mod.memory(2);
    const arr = Mem.i32Array(BASE);

    yield* Mod.exportFunc("kadane", { len: Type.i32 }, function* (len) {
      const [i, current_sum, max_sum, v] = yield* locals(Type.i32, Type.i32, Type.i32, Type.i32);

      yield* current_sum.set(arr.load(0));
      yield* max_sum.set(current_sum);

      yield* Ctrl.for(i, 1, i.lt(len), i.add(1), () => [
        v.set(arr.load(i)),
        current_sum.set(Op.max(current_sum.add(v), v)),
        max_sum.set(Op.max(current_sum, max_sum)),
      ]);

      return max_sum;
    });
  });
}
