import { compile, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem5_binary_search() {
  return compile<{ binary_search: (len: number, target: number) => number }>(function* () {
    const arr = Mem.i32Array();

    yield* Mod.exportFunc("binary_search", { len: Type.i32, target: Type.i32 }, function* (len, target) {
      const lo = yield* local(Type.i32, 0);
      const hi = yield* local(Type.i32, len.sub(1));
      const mid = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* Ctrl.while(lo.le(hi), () => [
        mid.set(lo.add(hi).div(2)),
        v.set(arr.load(mid)),
        Ctrl.when(v.eq(target), () => [
          Loc.return(mid),
        ]),
        Ctrl.if(v.lt(target))
          .then(function* () { yield* lo.set(mid.add(1)); })
          .else(function* () { yield* hi.set(mid.sub(1)); }),
      ]);

      return yield* Mem.i32(-1);
    });
  });
}
