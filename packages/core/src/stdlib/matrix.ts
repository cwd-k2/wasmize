/**
 * Matrix operations for linear memory.
 *
 * - `matTranspose`: i32 matrix transpose
 * - `matMulF64`: f64 matrix multiplication
 * - `matScale`: i32 scalar multiplication
 *
 * All matrices use row-major layout.
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * matTranspose(src, dst, rows, cols) — transpose i32 matrix.
 *
 * Reads from src[i*cols + j] and writes to dst[j*rows + i].
 * Both src and dst are byte addresses of i32 arrays.
 *
 * Params: src (i32), dst (i32), rows (i32), cols (i32).
 */
export const matTranspose: StdlibFunc = {
  params: ["i32", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const src = yield* param(Type.i32);
    const dst = yield* param(Type.i32);
    const rows = yield* param(Type.i32);
    const cols = yield* param(Type.i32);

    const srcArr = Mem.i32Array(src);
    const dstArr = Mem.i32Array(dst);

    const i = yield* local(Type.i32);
    const j = yield* local(Type.i32);

    yield* Ctrl.for(i, 0, i.lt(rows), i.add(1), function* () {
      yield* Ctrl.for(j, 0, j.lt(cols), j.add(1), function* () {
        // dst[j * rows + i] = src[i * cols + j]
        yield* dstArr.store(j.mul(rows).add(i), srcArr.load(i.mul(cols).add(j)));
      });
    });
  },
};

/**
 * matMulF64(a, b, dst, m, n, k) — f64 matrix multiplication.
 *
 * Computes C = A * B where:
 * - A is m x k (at byte address `a`)
 * - B is k x n (at byte address `b`)
 * - C is m x n (at byte address `dst`)
 *
 * All matrices stored as row-major f64 arrays.
 *
 * Params: a (i32), b (i32), dst (i32), m (i32), n (i32), k (i32).
 */
export const matMulF64: StdlibFunc = {
  params: ["i32", "i32", "i32", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const aBase = yield* param(Type.i32);
    const bBase = yield* param(Type.i32);
    const dstBase = yield* param(Type.i32);
    const m = yield* param(Type.i32);
    const n = yield* param(Type.i32);
    const kParam = yield* param(Type.i32);

    const i = yield* local(Type.i32);
    const j = yield* local(Type.i32);
    const p = yield* local(Type.i32);
    const sum = yield* local(Type.f64);
    const addr = yield* local(Type.i32);

    yield* Ctrl.for(i, 0, i.lt(m), i.add(1), function* () {
      yield* Ctrl.for(j, 0, j.lt(n), j.add(1), function* () {
        yield* sum.set(Mem.f64(0.0));

        yield* Ctrl.for(p, 0, p.lt(kParam), p.add(1), function* () {
          // sum += A[i*k + p] * B[p*n + j]
          // f64 is 8 bytes
          const aAddr = yield* local(Type.i32, aBase.add(i.mul(kParam).add(p).mul(8)));
          const bAddr = yield* local(Type.i32, bBase.add(p.mul(n).add(j).mul(8)));
          yield* sum.set(sum.add(Mem.loadF64(aAddr).mul(Mem.loadF64(bAddr))));
        });

        // C[i*n + j] = sum
        yield* addr.set(dstBase.add(i.mul(n).add(j).mul(8)));
        yield* Mem.storeF64(addr, sum);
      });
    });
  },
};

/**
 * matScale(src, dst, count, scalar) — scale all i32 elements by scalar.
 *
 * Reads `count` i32 values from `src` (byte address), multiplies each by
 * `scalar`, and writes to `dst` (byte address).
 *
 * Params: src (i32), dst (i32), count (i32), scalar (i32).
 */
export const matScale: StdlibFunc = {
  params: ["i32", "i32", "i32", "i32"],
  results: [],
  body: function* () {
    const src = yield* param(Type.i32);
    const dst = yield* param(Type.i32);
    const count = yield* param(Type.i32);
    const scalar = yield* param(Type.i32);

    const srcArr = Mem.i32Array(src);
    const dstArr = Mem.i32Array(dst);

    const i = yield* local(Type.i32);

    yield* Ctrl.for(i, 0, i.lt(count), i.add(1), function* () {
      yield* dstArr.store(i, srcArr.load(i).mul(scalar));
    });
  },
};
