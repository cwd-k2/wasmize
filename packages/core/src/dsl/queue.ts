import type { WasmRef, FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set } from "./expr";
import { Mem } from "./namespaces";
import { local, Type } from "./declarations";

export interface QueueHandle {
  /** Adds a value to the end of the queue. */
  enqueue(value: ExprInput): FuncGen<void>;
  /** Removes a value from the front and stores it in `dst`. */
  dequeue(dst: WasmRef<"i32">): FuncGen<void>;
  /** True while the queue has elements. Use as `Ctrl.while(q.notEmpty, ...)`. */
  readonly notEmpty: ChainableExpr;
  /** Resets head and tail to 0. */
  reset(): FuncGen<void>;
}

/**
 * Creates a BFS-style i32 queue backed by linear memory.
 *
 * Generator form: `const q = yield* Queue(base)` allocates internal
 * `head`/`tail` locals and returns an object with `enqueue`/`dequeue`/`notEmpty`/`reset`.
 *
 * @param base - Base byte offset for the queue's backing i32 array
 */
export function* Queue(base: ExprInput): Generator<any, QueueHandle, any> {
  const head: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const tail: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  return {
    enqueue(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* arr.store(tail, value);
        yield* tail.incrBy(1);
      })();
    },
    dequeue(dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* set(dst, arr.load(head));
        yield* head.incrBy(1);
      })();
    },
    get notEmpty(): ChainableExpr {
      return head.lt(tail);
    },
    reset(): FuncGen<void> {
      return (function* () {
        yield* set(head, 0);
        yield* set(tail, 0);
      })();
    },
  };
}
