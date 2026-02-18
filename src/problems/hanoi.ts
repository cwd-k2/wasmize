import {
  compile,
  import_,
  func,
  export_,
  param,
  local,
  mem,
  ctrl,
  loc,
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

      return yield* ctrl.if(n.le(0))
        .then(function* () {
          return yield* mem.i32(0);
        })
        .else(function* () {
          yield* loc.set(count1, ctrl.call(hanoi, n.sub(1), from, aux, to));
          yield* ctrl.call_(effect_move, from, to);
          yield* loc.set(count2, ctrl.call(hanoi, n.sub(1), aux, to, from));
          return yield* count1.add(1).add(count2);
        });
    });

    yield* export_("hanoi", hanoi);
  });
}
