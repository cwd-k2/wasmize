import { compile, param, local, mod, mem, ctrl, loc } from "../dsl/compiler";

export function problem2_fib_dp(): Uint8Array {
  return compile(function* () {
    const fib = yield* mod.func(function* () {
      const n = yield* param("i32");
      const i = yield* local("i32");

      // mem[0] = 0, mem[4] = 1
      yield* mem.store(0, 0);
      yield* mem.store(4, 1);

      // if n <= 1, return mem[n*4], else loop
      return yield* ctrl.if(n.le(1))
        .then(function* () {
          return yield* mem.load(n.mul(4));
        })
        .else(function* () {
          yield* loc.set(i, 2);
          yield* ctrl.block(function* () {
            yield* ctrl.loop(function* () {
              // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
              yield* mem.store(
                i.mul(4),
                mem.load(i.sub(1).mul(4)).add(mem.load(i.sub(2).mul(4))),
              );
              yield* i.set(i.add(1));
              yield* ctrl.br_if(0, i.le(n));
            });
          });
          return yield* mem.load(n.mul(4));
        });
    });

    yield* mod.export("fib", fib);
  });
}
