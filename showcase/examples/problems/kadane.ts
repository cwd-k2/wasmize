import { local, Type, Mod, Op, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem3_kadane() {
  const BASE = 1024;
  return compileWithWat<{ kadane: (len: number) => number }>(function* () {
    yield* Mod.memory(2);
    const arr = Mem.i32Array(BASE);

    yield* Mod.exportFunc("kadane", { len: Type.i32 }, function* (len) {
      const i = yield* local(Type.i32);
      const current_sum = yield* local(Type.i32);
      const max_sum = yield* local(Type.i32);
      const v = yield* local(Type.i32);

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
