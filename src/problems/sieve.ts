import { compile, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem7_sieve() {
  return compile<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("sieve", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32, 0);

      // Initialize: mark all 2..n as prime candidate
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
        Mem.store8(i, 1),
      ]);

      // Sieve: for p from 2 while p*p <= n
      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          Ctrl.for(j, i.mul(i), j.le(n), j.add(i), () => [
            Mem.store8(j, 0),
          ]),
        ]),
      ]);

      // Count primes
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          count.set(count.add(1)),
        ]),
      ]);

      return yield* Loc.get(count);
    });
  });
}
