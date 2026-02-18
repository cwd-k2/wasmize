import {
  compile,
  func,
  export_,
  memory,
  param,
  local,
  i32,
  get,
  add,
  mul,
  gt,
  lt,
  set,
  load,
  br_if,
  nop_,
  if_,
  loop_,
  block_,
} from "../dsl/compiler";

export function problem3_kadane(): Uint8Array {
  const BASE = 1024;
  return compile(function* () {
    yield* memory(2);

    const kadane = yield* func(function* () {
      const len = yield* param("i32");
      const i = yield* local("i32");
      const current_sum = yield* local("i32");
      const max_sum = yield* local("i32");
      const v = yield* local("i32");

      // max_sum = current_sum = mem[BASE]
      yield* set(current_sum, load(i32(BASE)));
      yield* set(max_sum, get(current_sum));
      yield* set(i, i32(1));

      // if len > 1, run loop
      yield* if_(
        gt(get(len), i32(1)),
        function* () {
          yield* block_(function* () {
            yield* loop_(function* () {
              // val = mem[BASE + i*4]
              yield* set(v, load(add(i32(BASE), mul(get(i), i32(4)))));
              // current_sum = max(val, current_sum + val)
              yield* set(
                current_sum,
                if_(
                  gt(add(get(current_sum), get(v)), get(v)),
                  function* () {
                    return yield* add(get(current_sum), get(v));
                  },
                  function* () {
                    return yield* get(v);
                  },
                ),
              );
              // max_sum = max(max_sum, current_sum)
              yield* set(
                max_sum,
                if_(
                  gt(get(current_sum), get(max_sum)),
                  function* () {
                    return yield* get(current_sum);
                  },
                  function* () {
                    return yield* get(max_sum);
                  },
                ),
              );
              yield* set(i, add(get(i), i32(1)));
              yield* br_if(0, lt(get(i), get(len)));
            });
          });
          yield* nop_();
        },
      );

      return yield* get(max_sum);
    });

    yield* export_("kadane", kadane);
  });
}
