import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem3_kadane(): Uint8Array {
  const BASE = 1024;
  return compile(function* () {
    yield* Mod.memory(2);

    const kadane = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const current_sum = yield* local(Type.i32);
      const max_sum = yield* local(Type.i32);
      const v = yield* local(Type.i32);

      // max_sum = current_sum = mem[BASE]
      yield* Loc.set(current_sum, Mem.load(BASE));
      yield* Loc.set(max_sum, Loc.get(current_sum));
      yield* Loc.set(i, 1);

      // if len > 1, run loop
      yield* Ctrl.if(len.gt(1))
        .then(function* () {
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              // val = mem[BASE + i*4]
              yield* v.set(Mem.load(i.mul(4).add(BASE)));
              // current_sum = max(val, current_sum + val)
              yield* Loc.set(
                current_sum,
                Ctrl.if(current_sum.add(v).gt(v))
                  .then(function* () {
                    return yield* current_sum.add(v);
                  })
                  .else(function* () {
                    return yield* Loc.get(v);
                  }),
              );
              // max_sum = max(max_sum, current_sum)
              yield* Loc.set(
                max_sum,
                Ctrl.if(current_sum.gt(max_sum))
                  .then(function* () {
                    return yield* Loc.get(current_sum);
                  })
                  .else(function* () {
                    return yield* Loc.get(max_sum);
                  }),
              );
              yield* i.set(i.add(1));
              yield* Ctrl.br_if(0, i.lt(len));
            });
          });
          yield* Ctrl.nop();
        });

      return yield* Loc.get(max_sum);
    });

    yield* Mod.export("kadane", kadane);
  });
}
