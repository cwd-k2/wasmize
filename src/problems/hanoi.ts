import {
  compile,
  import_,
  func,
  export_,
  param,
  local,
  i32,
  get,
  add,
  sub,
  le,
  set,
  call,
  call_,
  if_,
  type FuncRef,
} from "../dsl/compiler";

export function problem1_hanoi(): Uint8Array {
  return compile(function* () {
    const effect_move = yield* import_("env", "effect_move", ["i32", "i32"], []);

    let hanoi: FuncRef;
    hanoi = yield* func(function* () {
      const n = yield* param("i32");
      const from = yield* param("i32");
      const to = yield* param("i32");
      const aux = yield* param("i32");
      const count1 = yield* local("i32");
      const count2 = yield* local("i32");

      return yield* if_(
        le(get(n), i32(0)),
        function* () {
          return yield* i32(0);
        },
        function* () {
          // count1 = hanoi(n-1, from, aux, to)
          yield* set(count1, call(hanoi, sub(get(n), i32(1)), get(from), get(aux), get(to)));
          // effect_move(from, to)
          yield* call_(effect_move, get(from), get(to));
          // count2 = hanoi(n-1, aux, to, from)
          yield* set(count2, call(hanoi, sub(get(n), i32(1)), get(aux), get(to), get(from)));
          // return count1 + 1 + count2
          return yield* add(add(get(count1), i32(1)), get(count2));
        },
      );
    });

    yield* export_("hanoi", hanoi);
  });
}
