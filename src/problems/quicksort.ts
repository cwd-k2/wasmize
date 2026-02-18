import { compile, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem11_quicksort() {
  return compile<{ quicksort: (lo: number, hi: number) => number }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // partition(lo, hi) -> pivot index, Lomuto scheme
    const partition = yield* Mod.func(
      { lo: Type.i32, hi: Type.i32 },
      function* (lo, hi) {
        const pivot = yield* local(Type.i32);
        const i = yield* local(Type.i32);
        const j = yield* local(Type.i32);
        const tmp = yield* local(Type.i32);

        yield* pivot.set(arr.load(hi));
        yield* i.set(lo);

        yield* Ctrl.for(j, lo, j.lt(hi), j.add(1), () => [
          Ctrl.when(arr.load(j).le(pivot), () => [
            arr.swap(i, j, tmp),
            i.set(i.add(1)),
          ]),
        ]);

        // swap arr[i] and arr[hi]
        yield* arr.swap(i, hi, tmp);

        return yield* Loc.get(i);
      },
    );

    // quicksort(lo, hi) -> partition count
    const quicksort = yield* Mod.recursive(
      { lo: Type.i32, hi: Type.i32 },
      function* (self, lo, hi) {
        const p = yield* local(Type.i32);
        const left = yield* local(Type.i32);
        const right = yield* local(Type.i32);

        return yield* Ctrl.if(lo.lt(hi))
          .then(function* () {
            yield* p.set(partition(lo, hi));
            yield* left.set(
              Ctrl.if(lo.lt(p.sub(1)))
                .then(function* () { return yield* self(lo, p.sub(1)); })
                .else(function* () { return yield* Mem.i32(0); }),
            );
            yield* right.set(
              Ctrl.if(p.add(1).lt(hi))
                .then(function* () { return yield* self(p.add(1), hi); })
                .else(function* () { return yield* Mem.i32(0); }),
            );
            return yield* left.add(right).add(1);
          })
          .else(function* () {
            return yield* Mem.i32(0);
          });
      },
    );

    yield* Mod.export("quicksort", quicksort);
  });
}
