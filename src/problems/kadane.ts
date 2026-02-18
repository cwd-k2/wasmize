import {
  compile,
  func,
  export_,
  memory,
  param,
  local,
  get,
  load,
  set,
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
      yield* set(current_sum, load(BASE));
      yield* set(max_sum, get(current_sum));
      yield* set(i, 1);

      // if len > 1, run loop
      yield* if_(len.gt(1))
        .then(function* () {
          yield* block_(function* () {
            yield* loop_(function* () {
              // val = mem[BASE + i*4]
              yield* v.set(i.mul(4).add(BASE).load());
              // current_sum = max(val, current_sum + val)
              yield* set(
                current_sum,
                if_(current_sum.add(v).gt(v))
                  .then(function* () {
                    return yield* current_sum.add(v);
                  })
                  .else(function* () {
                    return yield* get(v);
                  }),
              );
              // max_sum = max(max_sum, current_sum)
              yield* set(
                max_sum,
                if_(current_sum.gt(max_sum))
                  .then(function* () {
                    return yield* get(current_sum);
                  })
                  .else(function* () {
                    return yield* get(max_sum);
                  }),
              );
              yield* i.set(i.add(1));
              yield* br_if(0, i.lt(len));
            });
          });
          yield* nop_();
        });

      return yield* get(max_sum);
    });

    yield* export_("kadane", kadane);
  });
}
