import {
  compile,
  func,
  export_,
  param,
  local,
  set,
  store,
  if_,
  loop_,
  block_,
  br_if,
} from "../dsl/compiler";

export function problem2_fib_dp(): Uint8Array {
  return compile(function* () {
    const fib = yield* func(function* () {
      const n = yield* param("i32");
      const i = yield* local("i32");

      // mem[0] = 0, mem[4] = 1
      yield* store(0, 0);
      yield* store(4, 1);

      // if n <= 1, return mem[n*4], else loop
      return yield* if_(n.le(1))
        .then(function* () {
          return yield* n.mul(4).load();
        })
        .else(function* () {
          yield* set(i, 2);
          yield* block_(function* () {
            yield* loop_(function* () {
              // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
              yield* i.mul(4).store(
                i.sub(1).mul(4).load().add(i.sub(2).mul(4).load()),
              );
              yield* i.set(i.add(1));
              yield* br_if(0, i.le(n));
            });
          });
          return yield* n.mul(4).load();
        });
    });

    yield* export_("fib", fib);
  });
}
