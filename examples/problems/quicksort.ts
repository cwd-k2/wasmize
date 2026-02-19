import { compile, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";

export function problem11_quicksort() {
  return compile<{ quicksort: (lo: number, hi: number) => void }>(function* () {
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
            i.incrBy(1),
          ]),
        ]);

        yield* arr.swap(i, hi, tmp);
        return i;
      },
    );

    // quicksort(lo, hi) — void, no partition count overhead
    const quicksort = yield* Mod.recursive(
      { lo: Type.i32, hi: Type.i32 },
      function* (self, lo, hi) {
        const p = yield* local(Type.i32);

        yield* Ctrl.when(lo.lt(hi), function* () {
          yield* p.set(partition(lo, hi));
          yield* self.void(lo, p.sub(1));
          yield* self.void(p.add(1), hi);
        });
      },
    );

    yield* Mod.export("quicksort", quicksort);
  });
}
