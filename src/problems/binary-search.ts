import {
  compile,
  func,
  export_,
  param,
  local,
  mem,
  ctrl,
  loc,
} from "../dsl/compiler";

export function problem5_binary_search(): Uint8Array {
  return compile(function* () {
    const search = yield* func(function* () {
      const len = yield* param("i32");
      const target = yield* param("i32");
      const lo = yield* local("i32");
      const hi = yield* local("i32");
      const mid = yield* local("i32");
      const v = yield* local("i32");

      yield* loc.set(lo, 0);
      yield* hi.set(len.sub(1));

      yield* ctrl.block(function* () {
        yield* ctrl.loop(function* () {
          yield* ctrl.br_if(1, lo.gt(hi));
          yield* mid.set(lo.add(hi).div(2));
          yield* v.set(mid.mul(4).load());
          yield* ctrl.if(v.eq(target))
            .then(function* () {
              yield* loc.return(mid);
            })
            .else(function* () {
              yield* ctrl.if(v.lt(target))
                .then(function* () {
                  yield* lo.set(mid.add(1));
                })
                .else(function* () {
                  yield* hi.set(mid.sub(1));
                });
              yield* ctrl.nop();
            });
          yield* ctrl.br(0);
        });
      });

      return yield* mem.i32(-1);
    });

    yield* export_("binary_search", search);
  });
}
