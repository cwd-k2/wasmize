import { compile, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem1_hanoi() {
  return compile<{ hanoi: (n: number, from: number, to: number, aux: number) => number }>(function* () {
    const hanoi = yield* Mod.recursive(
      { n: Type.i32, from: Type.i32, to: Type.i32, aux: Type.i32 },
      function* (self, n, from, to, aux) {
        const count1 = yield* local(Type.i32);
        const count2 = yield* local(Type.i32);

        return yield* Ctrl.if(n.le(0))
          .then(function* () {
            return yield* Mem.i32(0);
          })
          .else(function* () {
            yield* Loc.set(count1, self(n.sub(1), from, aux, to));
            yield* Loc.set(count2, self(n.sub(1), aux, to, from));
            return yield* count1.add(1).add(count2);
          });
      },
    );

    yield* Mod.export("hanoi", hanoi);
  });
}
