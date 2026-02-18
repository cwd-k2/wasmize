import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem6_gcd_array(): Uint8Array {
  return compile(function* () {
    yield* Mod.memory(1);

    // gcd(a, b) using Euclidean algorithm
    const gcd_fn = yield* Mod.func(function* () {
      const a = yield* param(Type.i32);
      const b = yield* param(Type.i32);
      const t = yield* local(Type.i32);

      // while b != 0: t = b; b = a % b; a = t
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, b.eq(0));
          yield* t.set(b);
          yield* b.set(a.rem(b));
          yield* a.set(t);
          yield* Ctrl.br(0);
        });
      });

      return yield* Loc.get(a);
    });

    // array_gcd(len) — mem[i*4] = input array
    const array_gcd = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const result = yield* local(Type.i32);
      const i = yield* local(Type.i32);

      yield* result.set(Mem.load(0));
      yield* i.set(1);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.ge(len));
          yield* result.set(gcd_fn(result, Mem.load(i.mul(4))));
          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      return yield* Loc.get(result);
    });

    yield* Mod.export("array_gcd", array_gcd);
  });
}
