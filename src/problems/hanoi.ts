import {
  compile,
  param,
  local,
  mod,
  mem,
  ctrl,
  loc,
  type CallableFunc,
} from "../dsl/compiler";

export function problem1_hanoi(): Uint8Array {
  return compile(function* () {
    const effect_move = yield* mod.import("env", "effect_move", ["i32", "i32"], []);

    let hanoi: CallableFunc;
    hanoi = yield* mod.func(function* () {
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
          yield* loc.set(count1, hanoi(n.sub(1), from, aux, to));
          yield* effect_move.void(from, to);
          yield* loc.set(count2, hanoi(n.sub(1), aux, to, from));
          return yield* count1.add(1).add(count2);
        });
    });

    yield* mod.export("hanoi", hanoi);
  });
}
