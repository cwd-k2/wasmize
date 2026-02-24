import type { WasmRef, FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set } from "./expr";
import { Mem } from "./namespaces";
import { local, Type } from "./declarations";

export interface StackHandle {
  /** Pushes a value onto the top of the stack. */
  push(value: ExprInput): FuncGen<void>;
  /** Pops the top value and stores it in `dst`. */
  pop(dst: WasmRef<"i32">): FuncGen<void>;
  /** True while the stack has elements. Use as `Ctrl.while(s.notEmpty, ...)`. */
  readonly notEmpty: ChainableExpr;
  /** Reads the top value without removing it. */
  peek(): ChainableExpr;
  /** Resets the stack to empty. */
  reset(): FuncGen<void>;
}

/**
 * Creates an i32 LIFO stack backed by linear memory.
 *
 * Generator form: `const s = yield* Stack(base)` allocates an internal
 * `top` local and returns an object with `push`/`pop`/`notEmpty`/`peek`/`reset`.
 *
 * @param base - Base byte offset for the stack's backing i32 array
 */
export function* Stack(base: ExprInput): Generator<any, StackHandle, any> {
  const top: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  return {
    push(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* arr.store(top, value);
        yield* top.incrBy(1);
      })();
    },
    pop(dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* top.decrBy(1);
        yield* set(dst, arr.load(top));
      })();
    },
    get notEmpty(): ChainableExpr {
      return top.gt(0);
    },
    peek(): ChainableExpr {
      return arr.load(top.sub(1));
    },
    reset(): FuncGen<void> {
      return (function* () {
        yield* set(top, 0);
      })();
    },
  };
}
