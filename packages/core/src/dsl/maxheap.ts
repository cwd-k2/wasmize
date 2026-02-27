import type { WasmRef, FuncGen } from "./types";
import { type ExprInput, ChainableExpr, set } from "./expr";
import { Mem, Ctrl } from "./namespaces";
import { local, Type } from "./declarations";

export interface MaxHeapHandle {
  /** Inserts a (priority, value) pair into the heap. */
  insert(priority: ExprInput, value: ExprInput): FuncGen<void>;
  /** Removes the maximum element and stores its priority/value in the given refs. */
  extractMax(dstPri: WasmRef<"i32">, dstVal: WasmRef<"i32">): FuncGen<void>;
  /** Reads the maximum priority without removing it. */
  peekPriority(): ChainableExpr;
  /** Reads the maximum value without removing it. */
  peekValue(): ChainableExpr;
  /** True while the heap has elements. Use as `Ctrl.while(heap.notEmpty, ...)`. */
  readonly notEmpty: ChainableExpr;
  /** Resets the heap to empty. */
  reset(): FuncGen<void>;
}

/**
 * Creates a max-heap (priority queue) backed by linear memory.
 *
 * Memory layout: interleaved `[pri0, val0, pri1, val1, ...]` using i32 pairs.
 * Generator form: `const heap = yield* MaxHeap(base)` allocates internal
 * locals and returns a handle with `insert`/`extractMax`/`peek`/`notEmpty`/`reset`.
 *
 * @param base - Base byte offset for the heap's backing i32 array
 */
export function* MaxHeap(base: ExprInput): Generator<any, MaxHeapHandle, any> {
  const sz: WasmRef<"i32"> = yield* local(Type.i32, 0);
  const idx: WasmRef<"i32"> = yield* local(Type.i32);
  const other: WasmRef<"i32"> = yield* local(Type.i32);
  const tmpPri: WasmRef<"i32"> = yield* local(Type.i32);
  const tmpVal: WasmRef<"i32"> = yield* local(Type.i32);
  const arr = Mem.i32Array(base);

  // Swap elements at positions a and b (each element = 2 i32 slots)
  function swap(a: WasmRef<"i32">, b: WasmRef<"i32">): FuncGen<void> {
    return (function* () {
      yield* set(tmpPri, arr.load(a.mul(2)));
      yield* set(tmpVal, arr.load(a.mul(2).add(1)));
      yield* arr.store(a.mul(2), arr.load(b.mul(2)));
      yield* arr.store(a.mul(2).add(1), arr.load(b.mul(2).add(1)));
      yield* arr.store(b.mul(2), tmpPri);
      yield* arr.store(b.mul(2).add(1), tmpVal);
    })();
  }

  return {
    insert(priority: ExprInput, value: ExprInput): FuncGen<void> {
      return (function* () {
        // Place at end
        yield* arr.store(sz.mul(2), priority);
        yield* arr.store(sz.mul(2).add(1), value);
        yield* sz.incrBy(1);

        // Sift up: idx starts at last element
        yield* set(idx, sz.sub(1));
        yield* Ctrl.block(function* () {
          yield* Ctrl.loop(function* () {
            // If at root, stop
            yield* Ctrl.when(idx.le(0), function* () {
              yield* Ctrl.br(2);
            });
            yield* set(other, idx.sub(1).div(2)); // parent index
            // If parent priority >= current priority, heap property satisfied
            yield* Ctrl.when(arr.load(other.mul(2)).ge(arr.load(idx.mul(2))), function* () {
              yield* Ctrl.br(2);
            });
            yield* swap(idx, other);
            yield* set(idx, other);
            yield* Ctrl.br(0); // continue
          });
        });
      })();
    },

    extractMax(dstPri: WasmRef<"i32">, dstVal: WasmRef<"i32">): FuncGen<void> {
      return (function* () {
        // Save max
        yield* set(dstPri, arr.load(0));
        yield* set(dstVal, arr.load(1));
        yield* sz.decrBy(1);

        // Move last element to root
        yield* arr.store(0, arr.load(sz.mul(2)));
        yield* arr.store(1, arr.load(sz.mul(2).add(1)));

        // Sift down from root
        yield* set(idx, 0);
        yield* Ctrl.block(function* () {
          yield* Ctrl.loop(function* () {
            // left child = 2*idx + 1
            yield* set(other, idx.mul(2).add(1));
            // If no left child, done
            yield* Ctrl.when(other.ge(sz), function* () {
              yield* Ctrl.br(2);
            });

            // If right child exists and has larger priority, use right
            yield* Ctrl.when(
              other.add(1).lt(sz).and(arr.load(other.add(1).mul(2)).gt(arr.load(other.mul(2)))),
              () => [other.incrBy(1)],
            );

            // If current priority >= largest child priority, done
            yield* Ctrl.when(arr.load(idx.mul(2)).ge(arr.load(other.mul(2))), function* () {
              yield* Ctrl.br(2);
            });

            yield* swap(idx, other);
            yield* set(idx, other);
            yield* Ctrl.br(0); // continue
          });
        });
      })();
    },

    peekPriority(): ChainableExpr {
      return arr.load(0);
    },

    peekValue(): ChainableExpr {
      return arr.load(1);
    },

    get notEmpty(): ChainableExpr {
      return sz.gt(0);
    },

    reset(): FuncGen<void> {
      return (function* () {
        yield* set(sz, 0);
      })();
    },
  };
}
