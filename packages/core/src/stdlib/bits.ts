/**
 * Bit manipulation utilities.
 *
 * `isPowerOf2`, `log2Floor`, `bswap32` are inline expression helpers
 * that return `ChainableExpr` — zero overhead, compile-time expansion.
 *
 * `nextPowerOf2Func` is a `StdlibFunc` (uses local variables for bit-smearing).
 *
 * For inline helpers, the input `n` is referenced multiple times,
 * so pass a `WasmRef` (local variable), not a single-use `ChainableExpr`.
 *
 * @module
 */
import { ChainableExpr } from "../dsl/expr";
import type { Expr } from "../dsl/types";
import { param, local, Type } from "../dsl/declarations";
import type { StdlibFunc } from "./index";

/**
 * Tests if n is a power of 2: `n != 0 && (n & (n - 1)) == 0`.
 * Input must be a WasmRef (referenced multiple times).
 */
export function isPowerOf2(n: Expr): ChainableExpr {
  return new ChainableExpr(n).and(new ChainableExpr(n).sub(1)).eqz()
    .and(new ChainableExpr(n).eqz().eqz());
}

/**
 * Floor of log2(n): `31 - clz(n)`.
 * Result is undefined for n = 0.
 */
export function log2Floor(n: Expr): ChainableExpr {
  return new ChainableExpr(n).clz().mul(-1).add(31);
}

/**
 * Next power of 2 >= n, using bit-smearing.
 * StdlibFunc: `(n: i32) -> i32`. For n <= 1, returns 1.
 */
export const nextPowerOf2Func: StdlibFunc = {
  params: ["i32"],
  results: ["i32"],
  body: function* () {
    const n = yield* param(Type.i32);
    const v = yield* local(Type.i32, n.sub(1));
    yield* v.orBy(v.shr(1));
    yield* v.orBy(v.shr(2));
    yield* v.orBy(v.shr(4));
    yield* v.orBy(v.shr(8));
    yield* v.orBy(v.shr(16));
    return yield* v.add(1);
  },
};

/**
 * Byte-swap a 32-bit integer.
 * `((n >> 24) & 0xFF) | ((n >> 8) & 0xFF00) | ((n << 8) & 0xFF0000) | (n << 24)`
 * Input must be a WasmRef (referenced multiple times).
 */
export function bswap32(n: Expr): ChainableExpr {
  const a = new ChainableExpr(n).shr(24).and(0xFF);
  const b = new ChainableExpr(n).shr(8).and(0xFF00);
  const c = new ChainableExpr(n).shl(8).and(0xFF0000);
  const d = new ChainableExpr(n).shl(24);
  return a.or(b).or(c).or(d);
}
