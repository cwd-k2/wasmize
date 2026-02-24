import type { WasmRef, FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set, rem_u, resolve } from "./expr";
import { Mem } from "./namespaces";
import { local, Type } from "./declarations";

export interface RingBufferHandle {
  /** Writes a value to the buffer (overwrites oldest if full). */
  write(value: ExprInput): FuncGen<void>;
  /** Reads the oldest value and stores it in `dst`. */
  read(dst: WasmRef<"i32">): FuncGen<void>;
  /** True when the buffer has reached capacity. */
  readonly isFull: ChainableExpr;
  /** True when the buffer has no elements. */
  readonly isEmpty: ChainableExpr;
  /** Resets head, tail, and count to 0. */
  reset(): FuncGen<void>;
}

/**
 * Creates a fixed-capacity circular i32 buffer backed by linear memory.
 *
 * Generator form: `const rb = yield* RingBuffer(base, 16)` allocates
 * `head`/`tail`/`count` locals and returns a handle with
 * `write`/`read`/`isFull`/`isEmpty`/`reset`.
 *
 * When `capacity` is a power of 2, index wrapping uses `and(capacity - 1)`
 * instead of `rem_u(_, capacity)` for efficiency. This is selected at compile time.
 *
 * @param base - Base byte offset for the ring buffer's backing i32 array
 * @param capacity - Fixed number of i32 elements (compile-time constant)
 */
export function* RingBuffer(
  base: ExprInput,
  capacity: number,
): Generator<any, RingBufferHandle, any> {
  const head: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const tail: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const count: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  const isPow2 = capacity > 0 && (capacity & (capacity - 1)) === 0;

  /** Wraps an index to [0, capacity). Chooses bitwise AND or rem_u at compile time. */
  function wrap(idx: ExprInput): ChainableExpr {
    if (isPow2) {
      return new ChainableExpr(resolve(idx)).and(capacity - 1);
    }
    return new ChainableExpr(rem_u(idx, capacity));
  }

  return {
    write(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* arr.store(tail, value);
        yield* set(tail, wrap(tail.add(1)));
        yield* count.incrBy(1);
      })();
    },
    read(dst: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        yield* set(dst, arr.load(head));
        yield* set(head, wrap(head.add(1)));
        yield* count.decrBy(1);
      })();
    },
    get isFull(): ChainableExpr {
      return count.ge(capacity);
    },
    get isEmpty(): ChainableExpr {
      return count.eq(0);
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
