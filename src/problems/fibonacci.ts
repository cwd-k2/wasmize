import {
  compile,
  func,
  export_,
  param,
  local,
  i32,
  get,
  add,
  sub,
  mul,
  le,
  set,
  store,
  load,
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
      yield* store(i32(0), i32(0));
      yield* store(i32(4), i32(1));

      // if n <= 1, return mem[n*4], else loop
      return yield* if_(
        le(get(n), i32(1)),
        function* () {
          return yield* load(mul(get(n), i32(4)));
        },
        function* () {
          yield* set(i, i32(2));
          yield* block_(function* () {
            yield* loop_(function* () {
              // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
              yield* store(
                mul(get(i), i32(4)),
                add(
                  load(mul(sub(get(i), i32(1)), i32(4))),
                  load(mul(sub(get(i), i32(2)), i32(4))),
                ),
              );
              yield* set(i, add(get(i), i32(1)));
              yield* br_if(0, le(get(i), get(n)));
            });
          });
          return yield* load(mul(get(n), i32(4)));
        },
      );
    });

    yield* export_("fib", fib);
  });
}
