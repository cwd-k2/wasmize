import type { WasmRef, FuncGen, WasmVal } from "./types";
import { type ExprInput, ChainableExpr, set } from "./expr";
import { Mem, Ctrl, Loc } from "./namespaces";
import { local, Type } from "./declarations";

export interface SortedArrayHandle {
  /** Inserts a value maintaining sorted order. */
  insert(value: ExprInput): FuncGen<void>;
  /** Returns 1 if the value exists, 0 otherwise. */
  has(value: ExprInput): FuncGen<WasmVal>;
  /** Deletes a value if it exists. */
  delete(value: ExprInput): FuncGen<void>;
  /** Returns the element at index i. */
  at(i: ExprInput): ChainableExpr;
  /** Current number of elements. */
  readonly length: ChainableExpr;
}

/**
 * Creates a sorted i32 array backed by linear memory.
 *
 * Generator form: `const sa = yield* SortedArray(base, capacity)` allocates
 * internal locals and returns a handle with `insert`/`has`/`delete`/`at`/`length`.
 *
 * Memory layout: i32 elements stored contiguously from `base`, always in ascending order.
 * Uses binary search for insertion point, and memmove (shift) for insert/delete.
 *
 * @param base - Base byte offset for the array's backing i32 storage
 * @param _capacity - Maximum number of elements (reserved for future bounds checking)
 */
export function* SortedArray(base: ExprInput, _capacity: number): Generator<any, SortedArrayHandle, any> {
  const len: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const arr = Mem.i32Array(base);

  // Shared temporaries for binary search and shifting
  const lo: WasmRef<"i32"> = yield* local(Type.i32);
  const hi: WasmRef<"i32"> = yield* local(Type.i32);
  const mid: WasmRef<"i32"> = yield* local(Type.i32);
  const pos: WasmRef<"i32"> = yield* local(Type.i32);
  const k: WasmRef<"i32"> = yield* local(Type.i32);
  const found: WasmRef<"i32"> = yield* local(Type.i32);

  /**
   * Binary search: sets `pos` to the lower-bound index (first position where arr[i] >= value).
   * After this, `pos` is the insertion point for maintaining sorted order.
   */
  function bsearch(value: ExprInput): FuncGen<void> {
    return (function* () {
      yield* set(lo, 0);
      yield* set(hi, len);
      yield* Ctrl.while(lo.lt(hi), function* () {
        yield* set(mid, lo.add(hi).div(2));
        yield* Ctrl.if(arr.load(mid).lt(value))
          .then(() => [set(lo, mid.add(1))])
          .else(() => [set(hi, mid)]);
      });
      yield* set(pos, lo);
    })();
  }

  return {
    insert(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* bsearch(value);

        // Shift elements right: for k = len down to pos+1, arr[k] = arr[k-1]
        yield* set(k, len);
        yield* Ctrl.while(k.gt(pos), function* () {
          yield* arr.store(k, arr.load(k.sub(1)));
          yield* k.decrBy(1);
        });

        // Insert value at pos
        yield* arr.store(pos, value);
        yield* len.incrBy(1);
      })();
    },

    has(value: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        yield* bsearch(value);
        // Check if pos is valid and arr[pos] == value
        yield* Ctrl.if(pos.lt(len).and(arr.load(pos).eq(value)))
          .then(() => [set(found, 1)])
          .else(() => [set(found, 0)]);
        return yield* Loc.get(found);
      })();
    },

    delete(value: ExprInput): FuncGen<void> {
      return (function* () {
        yield* bsearch(value);
        // If found, shift left
        yield* Ctrl.when(pos.lt(len).and(arr.load(pos).eq(value)), function* () {
          yield* set(k, pos);
          yield* Ctrl.while(k.lt(len.sub(1)), function* () {
            yield* arr.store(k, arr.load(k.add(1)));
            yield* k.incrBy(1);
          });
          yield* len.decrBy(1);
        });
      })();
    },

    at(i: ExprInput): ChainableExpr {
      return arr.load(i);
    },

    get length(): ChainableExpr {
      return len.add(0);
    },
  };
}
