import { Mem, Ctrl } from "./namespaces";
import { ChainableExpr, ge, lt, or_, type ExprInput } from "./expr";
import type { FuncGen } from "./types";
import type { BumpAllocator } from "./allocator";

/**
 * Creates a bounds-checked i32 array helper.
 * Inserts runtime checks before each load/store:
 * if (index < 0 || index >= count) unreachable;
 */
export function boundsCheckedArray(
  alloc: BumpAllocator,
  count: number,
): {
  load(idx: ExprInput): ChainableExpr;
  store(idx: ExprInput, value: ExprInput): FuncGen<void>;
} {
  const base = alloc.alloc(count * 4, 4);
  const inner = Mem.i32Array(base);

  function* boundsCheck(idx: ExprInput): Generator<any, void, any> {
    yield* Ctrl.when(or_(lt(idx, 0), ge(idx, count)), function* () {
      yield* Ctrl.unreachable();
    });
  }

  return {
    load(idx: ExprInput): ChainableExpr {
      return new ChainableExpr(
        (function* () {
          yield* boundsCheck(idx);
          return yield* inner.load(idx);
        })(),
      );
    },
    store(idx: ExprInput, value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* boundsCheck(idx);
        yield* inner.store(idx, value);
      })();
    },
  };
}
