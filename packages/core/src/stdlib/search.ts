import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl } from "../dsl/namespaces";
import { set } from "../dsl/expr";
import type { StdlibFunc } from "./index";

/**
 * binarySearch(base, len, target) -> i32
 * Searches for `target` in a sorted i32 array at word offsets [0..len).
 * Returns the index if found, or -1 if not found.
 */
export const binarySearch: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const target = yield* param(Type.i32);
    const lo = yield* local(Type.i32, 0);
    const hi = yield* local(Type.i32, len);
    const mid = yield* local(Type.i32);
    const val_ = yield* local(Type.i32);
    const result = yield* local(Type.i32, -1);
    const arr = Mem.i32Array(base);

    yield* Ctrl.while(lo.lt(hi), function* () {
      // mid = lo + (hi - lo) / 2
      yield* set(mid, lo.add(hi.sub(lo).shr(1)));
      yield* set(val_, arr.load(mid));
      yield* Ctrl.if(val_.eq(target))
        .then(() => [
          set(result, mid),
          // Break out of loop by setting lo = hi
          set(lo, hi),
        ])
        .elseif(val_.lt(target))
        .then(() => [set(lo, mid.add(1))])
        .else(() => [set(hi, mid)]);
    });

    return result;
  },
};

/**
 * lowerBound(base, len, target) -> i32
 * Returns the index of the first element >= target in a sorted i32 array.
 * If all elements are < target, returns len.
 */
export const lowerBound: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const target = yield* param(Type.i32);
    const lo = yield* local(Type.i32, 0);
    const hi = yield* local(Type.i32, len);
    const mid = yield* local(Type.i32);
    const arr = Mem.i32Array(base);

    yield* Ctrl.while(lo.lt(hi), function* () {
      yield* set(mid, lo.add(hi.sub(lo).shr(1)));
      yield* Ctrl.if(arr.load(mid).lt(target))
        .then(() => [set(lo, mid.add(1))])
        .else(() => [set(hi, mid)]);
    });

    return lo;
  },
};

/**
 * upperBound(base, len, target) -> i32
 * Returns the index of the first element > target in a sorted i32 array.
 * If all elements are <= target, returns len.
 */
export const upperBound: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const target = yield* param(Type.i32);
    const lo = yield* local(Type.i32, 0);
    const hi = yield* local(Type.i32, len);
    const mid = yield* local(Type.i32);
    const arr = Mem.i32Array(base);

    yield* Ctrl.while(lo.lt(hi), function* () {
      yield* set(mid, lo.add(hi.sub(lo).shr(1)));
      yield* Ctrl.if(arr.load(mid).le(target))
        .then(() => [set(lo, mid.add(1))])
        .else(() => [set(hi, mid)]);
    });

    return lo;
  },
};
