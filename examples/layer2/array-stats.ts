import { wasmize } from "@/declarative";
import { local, Type, Op, Ctrl, Mem } from "@/dsl/primitives";

/**
 * Array Statistics via wasmize() — Layer 2 API (multi-function).
 *
 * wasmize() の複数関数宣言を活用。同じ layout を共有する sum / max / min を
 * 1 つの ModuleSpec で宣言し、1 回のコンパイル・インスタンス化で全て利用。
 */
export async function arrayStats() {
  const mod = await wasmize({
    layout: {
      arr: { type: "i32" as const, count: 256 },
    },
    functions: {
      sum: {
        params: { len: "i32" as const },
        body: function* (len) {
          const arr = Mem.i32Array();
          const i = yield* local(Type.i32);
          const acc = yield* local(Type.i32, 0);

          yield* Ctrl.for(i, 0, i.lt(len), i.add(1), () => [
            acc.incrBy(arr.load(i)),
          ]);

          return acc;
        },
      },
      max: {
        params: { len: "i32" as const },
        body: function* (len) {
          const arr = Mem.i32Array();
          const i = yield* local(Type.i32);
          const best = yield* local(Type.i32, arr.load(0));

          yield* Ctrl.for(i, 1, i.lt(len), i.add(1), () => [
            best.set(Op.max(best, arr.load(i))),
          ]);

          return best;
        },
      },
      min: {
        params: { len: "i32" as const },
        body: function* (len) {
          const arr = Mem.i32Array();
          const i = yield* local(Type.i32);
          const best = yield* local(Type.i32, arr.load(0));

          yield* Ctrl.for(i, 1, i.lt(len), i.add(1), () => [
            best.set(Op.min(best, arr.load(i))),
          ]);

          return best;
        },
      },
    },
  });

  return mod;
}
