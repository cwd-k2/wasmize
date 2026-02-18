import { compile, param, local, Type, Mod, Ctrl, Loc } from "../dsl/compiler";
import { Mem } from "../dsl/compiler";

export function problem13_lis() {
  const TAILS_BASE = 16384;

  return compile<{ lis: (len: number) => number }>(function* () {
    yield* Mod.memory(1);
    const input = Mem.i32Array();
    const tails = Mem.i32Array(TAILS_BASE);

    // lower_bound(tails_len, target) -> first index where tails[idx] >= target
    const lower_bound = yield* Mod.func(function* () {
      const tails_len = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const lo = yield* local(Type.i32, 0);
      const hi = yield* local(Type.i32, tails_len);
      const mid = yield* local(Type.i32);

      yield* Ctrl.while(lo.lt(hi), function* () {
        yield* mid.set(lo.add(hi).div(2));
        yield* Ctrl.if(tails.load(mid).lt(target))
          .then(function* () { yield* lo.set(mid.add(1)); })
          .else(function* () { yield* hi.set(mid); });
      });

      return yield* Loc.get(lo);
    });

    // lis(len) -> LIS length
    const lis = yield* Mod.func(function* () {
      const len = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const tails_len = yield* local(Type.i32, 0);
      const pos = yield* local(Type.i32);
      const val = yield* local(Type.i32);

      yield* Ctrl.for(i, 0, i.lt(len), i.add(1), function* () {
        yield* val.set(input.load(i));
        yield* pos.set(lower_bound(tails_len, val));
        yield* tails.store(pos, val);
        yield* Ctrl.when(pos.eq(tails_len), function* () {
          yield* tails_len.set(tails_len.add(1));
        });
      });

      return yield* Loc.get(tails_len);
    });

    yield* Mod.export("lis", lis);
  });
}
