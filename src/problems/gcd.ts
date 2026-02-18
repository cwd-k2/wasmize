import { compile, local, Type, Mod, Ctrl, Loc } from "../dsl/compiler";
import { Mem } from "../dsl/compiler";

export function problem6_gcd_array() {
  return compile<{ array_gcd: (len: number) => number }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // gcd(a, b) using Euclidean algorithm
    const gcd_fn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
      const t = yield* local(Type.i32);

      yield* Ctrl.while(b.ne(0), () => [
        t.set(b),
        b.set(a.rem(b)),
        a.set(t),
      ]);

      return yield* Loc.get(a);
    });

    // array_gcd(len)
    yield* Mod.exportFunc("array_gcd", { len: Type.i32 }, function* (len) {
      const result = yield* local(Type.i32);
      const i = yield* local(Type.i32);

      yield* result.set(arr.load(0));

      yield* Ctrl.for(i, 1, i.lt(len), i.add(1), () => [
        result.set(gcd_fn(result, arr.load(i))),
      ]);

      return yield* Loc.get(result);
    });
  });
}
