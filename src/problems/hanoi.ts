import {
  compile,
  param,
  local,
  Type,
  Mod,
  Mem,
  Ctrl,
  Loc,
  type CallableFunc,
} from "../dsl/compiler";

export function problem1_hanoi(): Uint8Array {
  return compile(function* () {
    const effect_move = yield* Mod.import("env", "effect_move", [Type.i32, Type.i32], []);

    let hanoi: CallableFunc;
    hanoi = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const from = yield* param(Type.i32);
      const to = yield* param(Type.i32);
      const aux = yield* param(Type.i32);
      const count1 = yield* local(Type.i32);
      const count2 = yield* local(Type.i32);

      return yield* Ctrl.if(n.le(0))
        .then(function* () {
          return yield* Mem.i32(0);
        })
        .else(function* () {
          yield* Loc.set(count1, hanoi(n.sub(1), from, aux, to));
          yield* effect_move.void(from, to);
          yield* Loc.set(count2, hanoi(n.sub(1), aux, to, from));
          return yield* count1.add(1).add(count2);
        });
    });

    yield* Mod.export("hanoi", hanoi);
  });
}
