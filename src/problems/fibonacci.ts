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

export function problem2_fib_dp(): Uint8Array {
  return compile(function* () {
    const fib = yield* func(function* () {
      const n = yield* param("i32");
      const i = yield* local("i32");

      // mem[0] = 0, mem[4] = 1
      yield* mem.store(0, 0);
      yield* mem.store(4, 1);

      // if n <= 1, return mem[n*4], else loop
      return yield* ctrl.if(n.le(1))
        .then(function* () {
          return yield* n.mul(4).load();
        })
        .else(function* () {
          yield* loc.set(i, 2);
          yield* ctrl.block(function* () {
            yield* ctrl.loop(function* () {
              // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
              yield* i.mul(4).store(
                i.sub(1).mul(4).load().add(i.sub(2).mul(4).load()),
              );
              yield* i.set(i.add(1));
              yield* ctrl.br_if(0, i.le(n));
            });
          });
          return yield* n.mul(4).load();
        });
    });

    yield* export_("fib", fib);
  });
}
