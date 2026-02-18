import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem7_sieve(): Uint8Array {
  return compile(function* () {
    yield* Mod.memory(2);

    // sieve(n) -> count of primes <= n
    const sieve = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32);

      // Initialize: mark all 0..n as 1 (prime candidate)
      yield* i.set(2);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.gt(n));
          yield* Mem.store8(i, 1);
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Sieve: for p from 2 while p*p <= n
      yield* i.set(2);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.mul(i).gt(n));
          // if sieve[i] == 1 (still prime), mark multiples
          yield* Ctrl.if(Mem.load8(i).eq(1))
            .then(function* () {
              yield* j.set(i.mul(i));
              yield* Ctrl.block(function* () {
                yield* Ctrl.loop(function* () {
                  yield* Ctrl.br_if(1, j.gt(n));
                  yield* Mem.store8(j, 0);
                  yield* j.set(j.add(i));
                  yield* Ctrl.br(0);
                });
              });
            });
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Count primes
      yield* count.set(0);
      yield* i.set(2);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.gt(n));
          yield* Ctrl.if(Mem.load8(i).eq(1))
            .then(function* () {
              yield* count.set(count.add(1));
            });
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      return yield* Loc.get(count);
    });

    yield* Mod.export("sieve", sieve);
  });
}
