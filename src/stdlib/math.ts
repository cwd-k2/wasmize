import { param, local, Type } from "../dsl/declarations";
import { Op, Ctrl } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * pow(base, exp) — integer exponentiation via repeated squaring.
 * Params: base (i32), exp (i32). Returns i32.
 */
export const pow: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const base = yield* param(Type.i32);
    const exp = yield* param(Type.i32);
    const result = yield* local(Type.i32, 1);
    const b = yield* local(Type.i32, base);
    const e = yield* local(Type.i32, exp);
    // Square-and-multiply
    yield* Ctrl.while(e.gt(0), () => [
      Ctrl.when(e.and(1), () => [result.mulBy(b)]),
      b.mulBy(b),
      e.shrBy(1),
    ]);
    return result;
  },
};

/**
 * clamp(val, min, max) — clamps val to [min, max] range.
 * Params: val (i32), min (i32), max (i32). Returns i32.
 */
export const clamp: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const val_ = yield* param(Type.i32);
    const min = yield* param(Type.i32);
    const max = yield* param(Type.i32);
    // select-based: max(min, min(val, max))
    return yield* Op.max(Op.min(val_, max), min);
  },
};

/**
 * abs(val) — integer absolute value.
 * Params: val (i32). Returns i32.
 */
export const abs: StdlibFunc = {
  params: ["i32"],
  results: ["i32"],
  body: function* () {
    const val_ = yield* param(Type.i32);
    // select-based: val >= 0 ? val : -val
    return yield* Op.select(val_.ge(0), val_, val_.mul(-1));
  },
};

/**
 * lerp(a, b, t) — f64 linear interpolation: a + (b - a) * t.
 * Params: a (f64), b (f64), t (f64). Returns f64.
 */
export const lerp: StdlibFunc = {
  params: ["f64", "f64", "f64"],
  results: ["f64"],
  body: function* () {
    const a = yield* param(Type.f64);
    const b = yield* param(Type.f64);
    const t = yield* param(Type.f64);
    // a + (b - a) * t
    return yield* a.add(b.sub(a).mul(t));
  },
};
