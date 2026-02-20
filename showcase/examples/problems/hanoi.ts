import { local, Type, Mod, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem1_hanoi() {
  return compileWithWat<{ hanoi: (n: number, from: number, to: number, aux: number) => number }>(
    function* () {
      const hanoi = yield* Mod.recursive(
        { n: Type.i32, from: Type.i32, to: Type.i32, aux: Type.i32 },
        function* (self, n, from, to, aux) {
          const count1 = yield* local(Type.i32);
          const count2 = yield* local(Type.i32);

          return yield* Ctrl.if(n.le(0))
            .then(function* () {
              return 0;
            })
            .else(function* () {
              yield* count1.set(self(n.sub(1), from, aux, to));
              yield* count2.set(self(n.sub(1), aux, to, from));
              return yield* count1.add(1).add(count2);
            });
        },
      );

      yield* Mod.export("hanoi", hanoi);
    },
  );
}
