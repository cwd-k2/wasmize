import type { WasmRef, FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set, resolve } from "./expr";
import { Mem } from "./namespaces";
import { local, Type } from "./declarations";

export interface DequeHandle {
  /** Adds a value to the front of the deque. */
  pushFront(value: ExprInput): FuncGen<void>;
  /** Adds a value to the back of the deque. */
  pushBack(value: ExprInput): FuncGen<void>;
  /** Removes a value from the front and stores it in `dst`. */
  popFront(dst: WasmRef<"i32">): FuncGen<void>;
  /** Removes a value from the back and stores it in `dst`. */
  popBack(dst: WasmRef<"i32">): FuncGen<void>;
  /** True while the deque has elements. Use as `Ctrl.while(dq.notEmpty, ...)`. */
  readonly notEmpty: ChainableExpr;
  /** Resets head, tail, and count to 0. */
  reset(): FuncGen<void>;
}

/**
 * Creates a double-ended queue (deque) backed by a circular buffer in linear memory.
 *
 * Generator form: `const dq = yield* Deque(base, capacity)` allocates internal
 * `head`/`tail`/`count` locals and returns a handle with
 * `pushFront`/`pushBack`/`popFront`/`popBack`/`notEmpty`/`reset`.
 *
 * @param base - Base byte offset for the deque's backing i32 array
 * @param capacity - Fixed number of i32 elements (must be power of 2)
 */
export function* Deque(
  base: ExprInput,
  capacity: number,
): Generator<any, DequeHandle, any> {
  if (capacity <= 0 || (capacity & (capacity - 1)) !== 0) {
    throw new Error(`Deque capacity must be a power of 2, got ${capacity}`);
  }

  const mask = capacity - 1;
  const head: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const tail: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const count: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  /** Wraps an index to [0, capacity) using bitwise AND. */
  function wrap(idx: ExprInput): ChainableExpr {
    return new ChainableExpr(resolve(idx)).and(mask);
  }

  return {
    pushFront(value: ExprInput): FuncGen<void> {
      return (function* () {
        // Decrement head (with wrap) and store value
        yield* set(head, wrap(head.sub(1)));
        yield* arr.store(head, value);
        yield* count.incrBy(1);
      })();
    },

    pushBack(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* arr.store(tail, value);
        yield* set(tail, wrap(tail.add(1)));
        yield* count.incrBy(1);
      })();
    },

    popFront(dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* set(dst, arr.load(head));
        yield* set(head, wrap(head.add(1)));
        yield* count.decrBy(1);
      })();
    },

    popBack(dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* set(tail, wrap(tail.sub(1)));
        yield* set(dst, arr.load(tail));
        yield* count.decrBy(1);
      })();
    },

    get notEmpty(): ChainableExpr {
      return count.gt(0);
    },

    reset(): FuncGen<void> {
      return (function* () {
        yield* set(head, 0);
        yield* set(tail, 0);
        yield* set(count, 0);
      })();
    },
  };
}
