import {
  compile,
  param,
  local,
  Type,
  Mod,
  Mem,
  Ctrl,
  Loc,
  type CallableFunc,
} from "../dsl/compiler";

export function problem11_quicksort() {
  return compile<{ quicksort: (lo: number, hi: number) => number }>(function* () {
    yield* Mod.memory(1);
    const arr = Mem.i32Array();

    // partition(lo, hi) -> pivot index, Lomuto scheme
    const partition = yield* Mod.func(function* () {
      const lo = yield* param(Type.i32);
      const hi = yield* param(Type.i32);
      const pivot = yield* local(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);

      yield* pivot.set(arr.load(hi));
      yield* i.set(lo);

      yield* Ctrl.for(j, lo, j.lt(hi), j.add(1), function* () {
        yield* Ctrl.when(arr.load(j).le(pivot), function* () {
          yield* tmp.set(arr.load(i));
          yield* arr.store(i, arr.load(j));
          yield* arr.store(j, tmp);
          yield* i.set(i.add(1));
        });
      });

      // swap arr[i] and arr[hi]
      yield* tmp.set(arr.load(i));
      yield* arr.store(i, arr.load(hi));
      yield* arr.store(hi, tmp);

      return yield* Loc.get(i);
    });

    // quicksort(lo, hi) -> partition count
    let quicksort: CallableFunc;
    quicksort = yield* Mod.func(function* () {
      const lo = yield* param(Type.i32);
      const hi = yield* param(Type.i32);
      const p = yield* local(Type.i32);
      const left = yield* local(Type.i32);
      const right = yield* local(Type.i32);

      return yield* Ctrl.if(lo.lt(hi))
        .then(function* () {
          yield* p.set(partition(lo, hi));
          yield* left.set(
            Ctrl.if(lo.lt(p.sub(1)))
              .then(function* () { return yield* quicksort(lo, p.sub(1)); })
              .else(function* () { return yield* Mem.i32(0); }),
          );
          yield* right.set(
            Ctrl.if(p.add(1).lt(hi))
              .then(function* () { return yield* quicksort(p.add(1), hi); })
              .else(function* () { return yield* Mem.i32(0); }),
          );
          return yield* left.add(right).add(1);
        })
        .else(function* () {
          return yield* Mem.i32(0);
        });
    });

    yield* Mod.export("quicksort", quicksort);
  });
}
