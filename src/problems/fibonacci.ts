import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem2_fib_dp(): Uint8Array {
  return compile(function* () {
    const fib = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);

      // mem[0] = 0, mem[4] = 1
      yield* Mem.store(0, 0);
      yield* Mem.store(4, 1);

      // if n <= 1, return mem[n*4], else loop
      return yield* Ctrl.if(n.le(1))
        .then(function* () {
          return yield* Mem.load(n.mul(4));
        })
        .else(function* () {
          yield* Loc.set(i, 2);
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
              yield* Mem.store(
                i.mul(4),
                Mem.load(i.sub(1).mul(4)).add(Mem.load(i.sub(2).mul(4))),
              );
              yield* i.set(i.add(1));
              yield* Ctrl.br_if(0, i.le(n));
            });
          });
          return yield* Mem.load(n.mul(4));
        });
    });

    yield* Mod.export("fib", fib);
  });
}
