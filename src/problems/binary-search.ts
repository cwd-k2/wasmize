import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem5_binary_search() {
  return compile<{ binary_search: (len: number, target: number) => number }>(function* () {
    const arr = Mem.i32Array();

    const search = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32, 0);
      const hi = yield* local(Type.i32, len.sub(1));
      const mid = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* Ctrl.while(lo.le(hi), function* () {
        yield* mid.set(lo.add(hi).div(2));
        yield* v.set(arr.load(mid));
        yield* Ctrl.when(v.eq(target), function* () {
          yield* Loc.return(mid);
        });
        yield* Ctrl.if(v.lt(target))
          .then(function* () { yield* lo.set(mid.add(1)); })
          .else(function* () { yield* hi.set(mid.sub(1)); });
      });

      return yield* Mem.i32(-1);
    });

    yield* Mod.export("binary_search", search);
  });
}
