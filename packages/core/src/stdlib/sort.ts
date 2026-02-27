import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl, Mod, Op } from "../dsl/namespaces";
import { le, set } from "../dsl/expr";
import type { CallableFunc } from "../dsl/expr";
import type { FuncRef, ModuleGen } from "../dsl/types";
import type { StdlibFunc } from "./index";

/**
 * i32 natural-order quicksort (Lomuto partition).
 * Sorts i32 elements in-place in linear memory at word offsets.
 * Params: lo (i32), hi (i32) — inclusive word-offset range.
 */
export const sortI32: StdlibFunc = {
  params: ["i32", "i32"],
  results: [],
  body: function* () {
    const lo = yield* param(Type.i32);
    const hi = yield* param(Type.i32);
    // We need to use recursive self-call; since StdlibFunc doesn't
    // have self-reference, we implement partition + sort inline.
    // This body will be compiled as a single function, so we use
    // the block/loop/br pattern for an iterative approach instead.
    const arr = Mem.i32Array();
    const pivot = yield* local(Type.i32);
    const i = yield* local(Type.i32);
    const j = yield* local(Type.i32);
    const tmp = yield* local(Type.i32);
    const stack = yield* local(Type.i32, 60000); // stack base (avoids data region)
    const sp = yield* local(Type.i32);

    // Push initial [lo, hi] onto stack
    yield* sp.set(stack);
    yield* Mem.store(sp, lo);
    yield* sp.incrBy(4);
    yield* Mem.store(sp, hi);
    yield* sp.incrBy(4);

    // Iterative quicksort using explicit stack
    yield* Ctrl.while(sp.gt(stack), function* () {
      // Pop hi, lo
      yield* sp.decrBy(4);
      yield* hi.set(Mem.load(sp));
      yield* sp.decrBy(4);
      yield* lo.set(Mem.load(sp));

      yield* Ctrl.when(lo.lt(hi), function* () {
        // Lomuto partition
        yield* pivot.set(arr.load(hi));
        yield* i.set(lo);
        yield* Ctrl.for(j, lo, j.lt(hi), j.add(1), () => [
          Ctrl.when(arr.load(j).le(pivot), () => [arr.swap(i, j, tmp), i.incrBy(1)]),
        ]);
        yield* arr.swap(i, hi, tmp);

        // Push [lo, i-1] and [i+1, hi]
        yield* Mem.store(sp, lo);
        yield* sp.incrBy(4);
        yield* Mem.store(sp, i.sub(1));
        yield* sp.incrBy(4);
        yield* Mem.store(sp, i.add(1));
        yield* sp.incrBy(4);
        yield* Mem.store(sp, hi);
        yield* sp.incrBy(4);
      });
    });
  },
};

/**
 * Quicksort with custom comparator via `call_indirect`.
 * Sorts i32 elements at word offsets, using a table-based comparator.
 *
 * @param comparators - Array of comparator FuncRefs (i32, i32) -> i32
 * @returns ModuleGen yielding a sortWith(lo, hi, cmpIndex) callable
 */
export function sortWith(comparators: FuncRef[]): ModuleGen<CallableFunc> {
  return (function* () {
    const table = yield* Mod.table(comparators);

    const sortFn = yield* Mod.func(function* () {
      const lo = yield* param(Type.i32);
      const hi = yield* param(Type.i32);
      const cmpIdx = yield* param(Type.i32);
      const arr = Mem.i32Array();
      const pivot = yield* local(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);
      const stack = yield* local(Type.i32, 60000);
      const sp = yield* local(Type.i32);

      yield* sp.set(stack);
      yield* Mem.store(sp, lo);
      yield* sp.incrBy(4);
      yield* Mem.store(sp, hi);
      yield* sp.incrBy(4);

      yield* Ctrl.while(sp.gt(stack), function* () {
        yield* sp.decrBy(4);
        yield* hi.set(Mem.load(sp));
        yield* sp.decrBy(4);
        yield* lo.set(Mem.load(sp));

        yield* Ctrl.when(lo.lt(hi), function* () {
          yield* pivot.set(arr.load(hi));
          yield* i.set(lo);
          yield* Ctrl.for(j, lo, j.lt(hi), j.add(1), function* () {
            // Use call_indirect for comparison: cmp(arr[j], pivot) <= 0
            const cmpResult = yield* table.call(cmpIdx, arr.load(j), pivot);
            yield* Ctrl.when(le(cmpResult, 0), () => [arr.swap(i, j, tmp), i.incrBy(1)]);
          });
          yield* arr.swap(i, hi, tmp);

          yield* Mem.store(sp, lo);
          yield* sp.incrBy(4);
          yield* Mem.store(sp, i.sub(1));
          yield* sp.incrBy(4);
          yield* Mem.store(sp, i.add(1));
          yield* sp.incrBy(4);
          yield* Mem.store(sp, hi);
          yield* sp.incrBy(4);
        });
      });
    });

    return sortFn;
  })() as ModuleGen<CallableFunc>;
}

/**
 * Bottom-up iterative merge sort for i32 arrays. Stable sort.
 *
 * Params:
 * - base (i32): byte offset of the array to sort
 * - len (i32): number of i32 elements
 * - tmpBase (i32): byte offset for temporary work area (needs len * 4 bytes)
 *
 * Algorithm: iterates over increasing widths (1, 2, 4, ...), merging
 * adjacent pairs of subarrays into the tmp buffer, then copying back.
 */
export const mergeSort: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: [],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const tmpBase = yield* param(Type.i32);

    const arr = Mem.i32Array(base);
    const tmp = Mem.i32Array(tmpBase);

    const width = yield* local(Type.i32);
    const lo = yield* local(Type.i32);
    const mid = yield* local(Type.i32);
    const hi = yield* local(Type.i32);
    const i = yield* local(Type.i32);
    const j = yield* local(Type.i32);
    const k = yield* local(Type.i32);

    // Outer loop: width = 1, 2, 4, ... while width < len
    yield* Ctrl.for(width, 1, width.lt(len), width.mul(2), function* () {
      // Inner loop: merge pairs starting at lo, step = 2*width
      yield* Ctrl.for(lo, 0, lo.lt(len), lo.add(width.mul(2)), function* () {
        // mid = min(lo + width, len)
        yield* mid.set(yield* Op.min(lo.add(width), len));
        // hi = min(lo + 2*width, len)
        yield* hi.set(yield* Op.min(lo.add(width.mul(2)), len));

        // Merge arr[lo..mid) and arr[mid..hi) into tmp[lo..hi)
        yield* set(i, lo);
        yield* set(j, mid);
        yield* set(k, lo);

        // Merge while both halves have elements
        yield* Ctrl.while(i.lt(mid).and(j.lt(hi)), function* () {
          yield* Ctrl.if(arr.load(i).le(arr.load(j)))
            .then(() => [
              tmp.store(k, arr.load(i)),
              i.incrBy(1),
            ])
            .else(() => [
              tmp.store(k, arr.load(j)),
              j.incrBy(1),
            ]);
          yield* k.incrBy(1);
        });

        // Copy remaining left half
        yield* Ctrl.while(i.lt(mid), () => [
          tmp.store(k, arr.load(i)),
          i.incrBy(1),
          k.incrBy(1),
        ]);

        // Copy remaining right half
        yield* Ctrl.while(j.lt(hi), () => [
          tmp.store(k, arr.load(j)),
          j.incrBy(1),
          k.incrBy(1),
        ]);

        // Copy tmp[lo..hi) back to arr[lo..hi)
        yield* Ctrl.for(k, lo, k.lt(hi), k.add(1), () => [
          arr.store(k, tmp.load(k)),
        ]);
      });
    });
  },
};
