/**
 * Integer-specific sorting algorithms.
 *
 * - `countingSort(base, len, maxVal, tmpBase)` — O(n) counting sort
 * - `radixSort(base, len, tmpBase)` — LSD radix sort base-256, 4 passes
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl, Op } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * countingSort(base, len, maxVal, tmpBase) — counting sort for i32 values.
 *
 * Sorts in-place. Requires tmpBase to have (maxVal + 1) * 4 bytes of scratch space.
 *
 * Algorithm:
 * 1. Zero count array at tmpBase
 * 2. Count occurrences of each value
 * 3. Write values back in sorted order
 *
 * Params: base (i32), len (i32), maxVal (i32), tmpBase (i32). Returns void.
 */
export const countingSort: StdlibFunc = {
  params: ["i32", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const maxVal = yield* param(Type.i32);
    const tmpBase = yield* param(Type.i32);

    const arr = Mem.i32Array(base);
    const counts = Mem.i32Array(tmpBase);

    const i = yield* local(Type.i32);
    const val_ = yield* local(Type.i32);
    const writeIdx = yield* local(Type.i32, 0);

    // Step 1: Zero the count array (maxVal + 1 entries)
    yield* Ctrl.range(i, maxVal.add(1), () => [
      counts.store(i, 0),
    ]);

    // Step 2: Count occurrences
    yield* Ctrl.range(i, len, function* () {
      yield* val_.set(arr.load(i));
      yield* counts.at(val_).incrBy(1);
    });

    // Step 3: Write sorted values back
    yield* writeIdx.set(0);
    yield* Ctrl.range(i, maxVal.add(1), function* () {
      yield* Ctrl.while(counts.load(i).gt(0), () => [
        arr.store(writeIdx, i),
        writeIdx.incrBy(1),
        counts.at(i).decrBy(1),
      ]);
    });
  },
};

/**
 * radixSort(base, len, tmpBase) — LSD radix sort base-256, 4 passes for i32.
 *
 * Sorts unsigned i32 values. Uses tmpBase for a temporary array of len i32 elements
 * and 256 i32 counts. Total scratch: (len + 256) * 4 bytes at tmpBase.
 *
 * Algorithm: For each of the 4 bytes (LSB to MSB):
 * 1. Count occurrences of each byte value (256 buckets)
 * 2. Compute prefix sums
 * 3. Scatter from source to destination
 * 4. Copy destination back to source (or swap pointers)
 *
 * Params: base (i32), len (i32), tmpBase (i32). Returns void.
 */
export const radixSort: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: [],
  body: function* () {
    const base = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const tmpBase = yield* param(Type.i32);

    // Layout at tmpBase: [output array: len * 4 bytes] [counts: 256 * 4 bytes]
    // countsBase = tmpBase + len * 4
    const countsBase = yield* local(Type.i32, tmpBase.add(len.mul(4)));

    const src = Mem.i32Array(base);
    const dst = Mem.i32Array(tmpBase);
    const counts = Mem.i32Array(countsBase);

    const i = yield* local(Type.i32);
    const j = yield* local(Type.i32);
    const pass = yield* local(Type.i32);
    const shift = yield* local(Type.i32);
    const byte_ = yield* local(Type.i32);
    const val_ = yield* local(Type.i32);
    const prefixSum = yield* local(Type.i32);

    // 4 passes (one per byte)
    yield* Ctrl.range(pass, 4, function* () {
      yield* shift.set(pass.mul(8));

      // Clear counts
      yield* Ctrl.range(i, 256, () => [
        counts.store(i, 0),
      ]);

      // Count byte occurrences
      yield* Ctrl.range(i, len, function* () {
        yield* val_.set(src.load(i));
        yield* byte_.set(Op.shr_u(val_, shift));
        yield* byte_.andBy(0xFF);
        yield* counts.at(byte_).incrBy(1);
      });

      // Prefix sum (exclusive)
      yield* prefixSum.set(0);
      yield* Ctrl.range(i, 256, function* () {
        yield* val_.set(counts.load(i));
        yield* counts.store(i, prefixSum);
        yield* prefixSum.incrBy(val_);
      });

      // Scatter: place each element into dst at the prefix sum position
      yield* Ctrl.range(i, len, function* () {
        yield* val_.set(src.load(i));
        yield* byte_.set(Op.shr_u(val_, shift));
        yield* byte_.andBy(0xFF);
        yield* j.set(counts.load(byte_));
        yield* dst.store(j, val_);
        yield* counts.at(byte_).incrBy(1);
      });

      // Copy dst back to src
      yield* Ctrl.range(i, len, () => [
        src.store(i, dst.load(i)),
      ]);
    });
  },
};
