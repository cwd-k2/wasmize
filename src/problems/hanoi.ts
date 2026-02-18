import {
  compile,
  import_,
  func,
  export_,
  param,
  local,
  i32,
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

      return yield* if_(n.le(0))
        .then(function* () {
          return yield* i32(0);
        })
        .else(function* () {
          // count1 = hanoi(n-1, from, aux, to)
          yield* set(count1, call(hanoi, n.sub(1), from, aux, to));
          // effect_move(from, to)
          yield* call_(effect_move, from, to);
          // count2 = hanoi(n-1, aux, to, from)
          yield* set(count2, call(hanoi, n.sub(1), aux, to, from));
          // return count1 + 1 + count2
          return yield* count1.add(1).add(count2);
        });
    });

    yield* export_("hanoi", hanoi);
  });
}
