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
  div,
  eq,
  lt,
  gt,
  set,
  load,
  return_,
  br,
  br_if,
  nop_,
  if_,
  loop_,
  block_,
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

      yield* set(lo, i32(0));
      yield* set(hi, sub(get(len), i32(1)));

      yield* block_(function* () {
        yield* loop_(function* () {
          yield* br_if(1, gt(get(lo), get(hi)));
          yield* set(mid, div(add(get(lo), get(hi)), i32(2)));
          yield* set(v, load(mul(get(mid), i32(4))));
          yield* if_(
            eq(get(v), get(target)),
            function* () {
              yield* return_(get(mid));
            },
            function* () {
              yield* if_(
                lt(get(v), get(target)),
                function* () {
                  yield* set(lo, add(get(mid), i32(1)));
                },
                function* () {
                  yield* set(hi, sub(get(mid), i32(1)));
                },
              );
              yield* nop_();
            },
          );
          yield* br(0);
        });
      });

      return yield* i32(-1);
    });

    yield* export_("binary_search", search);
  });
}
