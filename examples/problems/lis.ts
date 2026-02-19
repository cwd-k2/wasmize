import { compile, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";

export function problem13_lis() {
  const TAILS_BASE = 65536;

  return compile<{ lis: (len: number) => number }>(function* () {
    yield* Mod.memory(2);
    const input = Mem.i32Array();
    const tails = Mem.i32Array(TAILS_BASE);

    // lis(len) -> LIS length — binary search inlined to avoid function call overhead
    yield* Mod.exportFunc("lis", { len: Type.i32 }, function* (len) {
      const i = yield* local(Type.i32);
      const tails_len = yield* local(Type.i32, 0);
      const lo = yield* local(Type.i32);
      const hi = yield* local(Type.i32);
      const mid = yield* local(Type.i32);
      const val = yield* local(Type.i32);

      yield* Ctrl.for(i, 0, i.lt(len), i.add(1), function* () {
        yield* val.set(input.load(i));

        // Inline lower_bound: find first index where tails[idx] >= val
        yield* lo.set(0);
        yield* hi.set(tails_len);
        yield* Ctrl.while(lo.lt(hi), function* () {
          yield* mid.set(lo.add(hi).div(2));
          yield* Ctrl.if(tails.load(mid).lt(val))
            .then(function* () { yield* lo.set(mid.add(1)); })
            .else(function* () { yield* hi.set(mid); });
        });

        yield* tails.store(lo, val);
        yield* Ctrl.when(lo.eq(tails_len), () => [
          tails_len.incrBy(1),
        ]);
      });

      return tails_len;
    });
  });
}
