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

export function problem11_quicksort(): Uint8Array {
  return compile(function* () {
    yield* Mod.memory(1);

    // partition(lo, hi) -> pivot index, Lomuto scheme
    const partition = yield* Mod.func(function* () {
      const lo = yield* param(Type.i32);
      const hi = yield* param(Type.i32);
      const pivot = yield* local(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);

      // pivot = mem[hi*4]
      yield* pivot.set(Mem.load(hi.mul(4)));
      yield* i.set(lo);
      yield* j.set(lo);

      // for j = lo to hi-1
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, j.ge(hi));

          // if mem[j*4] <= pivot, swap mem[i*4] and mem[j*4], i++
          yield* Ctrl.if(Mem.load(j.mul(4)).le(pivot))
            .then(function* () {
              // swap
              yield* tmp.set(Mem.load(i.mul(4)));
              yield* Mem.store(i.mul(4), Mem.load(j.mul(4)));
              yield* Mem.store(j.mul(4), tmp);
              yield* i.set(i.add(1));
            });

          yield* j.set(j.add(1));
          yield* Ctrl.br(0);
        });
      });

      // swap mem[i*4] and mem[hi*4]
      yield* tmp.set(Mem.load(i.mul(4)));
      yield* Mem.store(i.mul(4), Mem.load(hi.mul(4)));
      yield* Mem.store(hi.mul(4), tmp);

      return yield* Loc.get(i);
    });

    // quicksort(lo, hi) -> partition count (for verification)
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
          // Recursively sort left and right
          yield* left.set(
            Ctrl.if(lo.lt(p.sub(1)))
              .then(function* () {
                return yield* quicksort(lo, p.sub(1));
              })
              .else(function* () {
                return yield* Mem.i32(0);
              }),
          );
          yield* right.set(
            Ctrl.if(p.add(1).lt(hi))
              .then(function* () {
                return yield* quicksort(p.add(1), hi);
              })
              .else(function* () {
                return yield* Mem.i32(0);
              }),
          );
          // Return 1 (for this partition) + left + right
          return yield* left.add(right).add(1);
        })
        .else(function* () {
          return yield* Mem.i32(0);
        });
    });

    yield* Mod.export("quicksort", quicksort);
  });
}
