import { wasmize } from "@/declarative";
import { local, Type, Op, Ctrl, Mem, type ExprInput } from "@/dsl/primitives";
import type { WasmRef, FuncGen } from "@/dsl/types";

/**
 * Array Statistics via wasmize() — Layer 2 API (multi-function).
 *
 * wasmize() の複数関数宣言を活用。同じ layout を共有する sum / max / min を
 * 1 つの ModuleSpec で宣言し、1 回のコンパイル・インスタンス化で全て利用。
 */
export async function arrayStats() {
  const arr = Mem.i32Array();

  function reduceFunc(
    startIdx: number,
    init: ExprInput,
    combine: (acc: WasmRef, val: ExprInput) => FuncGen<void>,
  ) {
    return {
      params: { len: "i32" as const },
      body: function* (len: WasmRef) {
        const i = yield* local(Type.i32);
        const acc = yield* local(Type.i32, init);

        yield* Ctrl.for(i, startIdx, i.lt(len), i.add(1), () => [combine(acc, arr.load(i))]);

        return acc;
      },
    };
  }

  const mod = await wasmize({
    layout: {
      arr: { type: "i32" as const, count: 256 },
    },
    functions: {
      sum: reduceFunc(0, 0, (acc, v) => acc.incrBy(v)),
      max: reduceFunc(1, arr.load(0), (acc, v) => acc.set(Op.max(acc, v))),
      min: reduceFunc(1, arr.load(0), (acc, v) => acc.set(Op.min(acc, v))),
    },
  });

  return mod;
}
