import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem5_binary_search(): Uint8Array {
  return compile(function* () {
    const search = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32);
      const hi = yield* local(Type.i32);
      const mid = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      yield* Loc.set(lo, 0);
      yield* hi.set(len.sub(1));

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, lo.gt(hi));
          yield* mid.set(lo.add(hi).div(2));
          yield* v.set(Mem.load(mid.mul(4)));
          yield* Ctrl.if(v.eq(target))
            .then(function* () {
              yield* Loc.return(mid);
            })
            .else(function* () {
              yield* Ctrl.if(v.lt(target))
                .then(function* () {
                  yield* lo.set(mid.add(1));
                })
                .else(function* () {
                  yield* hi.set(mid.sub(1));
                });
              yield* Ctrl.nop();
            });
          yield* Ctrl.br(0);
        });
      });

      return yield* Mem.i32(-1);
    });

    yield* Mod.export("binary_search", search);
  });
}
