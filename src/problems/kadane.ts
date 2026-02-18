import { compile, param, local, Type, Mod, Ctrl, Loc } from "../dsl/compiler";
import { Mem } from "../dsl/compiler";

export function problem3_kadane() {
  const BASE = 1024;
  return compile<{ kadane: (len: number) => number }>(function* () {
    yield* Mod.memory(2);
    const arr = Mem.i32Array(BASE);

    const kadane = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const current_sum = yield* local(Type.i32);
      const max_sum = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* current_sum.set(arr.load(0));
      yield* max_sum.set(Loc.get(current_sum));

      yield* Ctrl.for(i, 1, i.lt(len), i.add(1), function* () {
        yield* v.set(arr.load(i));
        yield* current_sum.set(
          Ctrl.if(current_sum.add(v).gt(v))
            .then(function* () { return yield* current_sum.add(v); })
            .else(function* () { return yield* Loc.get(v); }),
        );
        yield* max_sum.set(
          Ctrl.if(current_sum.gt(max_sum))
            .then(function* () { return yield* Loc.get(current_sum); })
            .else(function* () { return yield* Loc.get(max_sum); }),
        );
      });

      return yield* Loc.get(max_sum);
    });

    yield* Mod.export("kadane", kadane);
  });
}
