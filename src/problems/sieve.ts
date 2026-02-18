import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem7_sieve() {
  return compile<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    const sieve = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32, 0);

      // Initialize: mark all 2..n as prime candidate
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
        yield* Mem.store8(i, 1);
      });

      // Sieve: for p from 2 while p*p <= n
      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), function* () {
        yield* Ctrl.when(Mem.load8(i).eq(1), function* () {
          yield* Ctrl.for(j, i.mul(i), j.le(n), j.add(i), function* () {
            yield* Mem.store8(j, 0);
          });
        });
      });

      // Count primes
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), function* () {
        yield* Ctrl.when(Mem.load8(i).eq(1), function* () {
          yield* count.set(count.add(1));
        });
      });

      return yield* Loc.get(count);
    });

    yield* Mod.export("sieve", sieve);
  });
}
