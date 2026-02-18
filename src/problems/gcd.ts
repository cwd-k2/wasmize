import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem6_gcd_array() {
  return compile<{ array_gcd: (len: number) => number }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // gcd(a, b) using Euclidean algorithm
    const gcd_fn = yield* Mod.func(function* () {
      const a = yield* param(Type.i32);
      const b = yield* param(Type.i32);
      const t = yield* local(Type.i32);

      yield* Ctrl.while(b.ne(0), function* () {
        yield* t.set(b);
        yield* b.set(a.rem(b));
        yield* a.set(t);
      });

      return yield* Loc.get(a);
    });

    // array_gcd(len)
    const array_gcd = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const result = yield* local(Type.i32);
      const i = yield* local(Type.i32);

      yield* result.set(arr.load(0));

      yield* Ctrl.for(i, 1, i.lt(len), i.add(1), function* () {
        yield* result.set(gcd_fn(result, arr.load(i)));
      });

      return yield* Loc.get(result);
    });

    yield* Mod.export("array_gcd", array_gcd);
  });
}
