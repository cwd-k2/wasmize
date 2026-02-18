import { compile, param, local, mod, mem, ctrl, loc } from "../dsl/compiler";

export function problem3_kadane(): Uint8Array {
  const BASE = 1024;
  return compile(function* () {
    yield* mod.memory(2);

    const kadane = yield* mod.func(function* () {
      const len = yield* param("i32");
      const i = yield* local("i32");
      const current_sum = yield* local("i32");
      const max_sum = yield* local("i32");
      const v = yield* local("i32");

      // max_sum = current_sum = mem[BASE]
      yield* loc.set(current_sum, mem.load(BASE));
      yield* loc.set(max_sum, loc.get(current_sum));
      yield* loc.set(i, 1);

      // if len > 1, run loop
      yield* ctrl.if(len.gt(1))
        .then(function* () {
          yield* ctrl.block(function* () {
            yield* ctrl.loop(function* () {
              // val = mem[BASE + i*4]
              yield* v.set(mem.load(i.mul(4).add(BASE)));
              // current_sum = max(val, current_sum + val)
              yield* loc.set(
                current_sum,
                ctrl.if(current_sum.add(v).gt(v))
                  .then(function* () {
                    return yield* current_sum.add(v);
                  })
                  .else(function* () {
                    return yield* loc.get(v);
                  }),
              );
              // max_sum = max(max_sum, current_sum)
              yield* loc.set(
                max_sum,
                ctrl.if(current_sum.gt(max_sum))
                  .then(function* () {
                    return yield* loc.get(current_sum);
                  })
                  .else(function* () {
                    return yield* loc.get(max_sum);
                  }),
              );
              yield* i.set(i.add(1));
              yield* ctrl.br_if(0, i.lt(len));
            });
          });
          yield* ctrl.nop();
        });

      return yield* loc.get(max_sum);
    });

    yield* mod.export("kadane", kadane);
  });
}
