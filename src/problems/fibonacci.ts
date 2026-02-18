import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem2_fib_dp() {
  return compile<{ fib: (n: number) => number }>(function* () {
    const arr = Mem.i32Array();

    const fib = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);

      yield* arr.store(0, 0);
      yield* arr.store(1, 1);

      return yield* Ctrl.if(n.le(1))
        .then(function* () {
          return yield* arr.load(n);
        })
        .else(function* () {
          yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
            yield* arr.store(i, arr.load(i.sub(1)).add(arr.load(i.sub(2))));
          });
          return yield* arr.load(n);
        });
    });

    yield* Mod.export("fib", fib);
  });
}
