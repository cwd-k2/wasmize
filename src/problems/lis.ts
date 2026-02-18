import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem13_lis(): Uint8Array {
  // Memory layout: input at 0, tails at 16384
  const TAILS_BASE = 16384;

  return compile(function* () {
    yield* Mod.memory(1);

    // lower_bound(tails_len, target) -> first index where tails[idx] >= target
    const lower_bound = yield* Mod.func(function* () {
      const tails_len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32);
      const hi = yield* local(Type.i32);
      const mid = yield* local(Type.i32);

      yield* lo.set(0);
      yield* hi.set(tails_len);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, lo.ge(hi));
          // mid = (lo + hi) / 2
          yield* mid.set(lo.add(hi).div(2));
          yield* Ctrl.if(Mem.load(mid.mul(4).add(TAILS_BASE)).lt(target))
            .then(function* () {
              yield* lo.set(mid.add(1));
            })
            .else(function* () {
              yield* hi.set(mid);
            });
          yield* Ctrl.br(0);
        });
      });

      return yield* Loc.get(lo);
    });

    // lis(len) -> LIS length
    const lis = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const tails_len = yield* local(Type.i32);
      const pos = yield* local(Type.i32);
      const val = yield* local(Type.i32);

      yield* tails_len.set(0);
      yield* i.set(0);

      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.ge(len));

          yield* val.set(Mem.load(i.mul(4)));
          yield* pos.set(lower_bound(tails_len, val));

          // tails[pos] = val
          yield* Mem.store(pos.mul(4).add(TAILS_BASE), val);

          // if pos == tails_len, extend
          yield* Ctrl.if(pos.eq(tails_len))
            .then(function* () {
              yield* tails_len.set(tails_len.add(1));
            });

          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      return yield* Loc.get(tails_len);
    });

    yield* Mod.export("lis", lis);
  });
}
