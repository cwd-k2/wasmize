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

/**
 * gcd(a, b) — greatest common divisor via Euclidean algorithm.
 * Params: a (i32), b (i32). Returns i32.
 */
export const gcd: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    const aa = yield* local(Type.i32, a);
    const bb = yield* local(Type.i32, b);
    const tmp = yield* local(Type.i32);
    yield* Ctrl.while(bb.ne(0), () => [
      tmp.set(bb),
      bb.set(Op.rem_u(aa, bb)),
      aa.set(tmp),
    ]);
    return aa;
  },
};

/**
 * lcm(a, b) — least common multiple: a / gcd(a, b) * b.
 * Division first to reduce overflow risk.
 * Params: a (i32), b (i32). Returns i32.
 */
export const lcm: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    // Compute gcd inline
    const aa = yield* local(Type.i32, a);
    const bb = yield* local(Type.i32, b);
    const tmp = yield* local(Type.i32);
    yield* Ctrl.while(bb.ne(0), () => [
      tmp.set(bb),
      bb.set(Op.rem_u(aa, bb)),
      aa.set(tmp),
    ]);
    // gcd is now in aa. If gcd == 0, return 0
    return yield* Ctrl.if(aa.eqz())
      .then(function* () { return 0; })
      .else(function* () {
        // a / gcd * b (division first to reduce overflow)
        const q = yield* local(Type.i32, Op.div_u(a, aa));
        return yield* q.mul(b);
      });
  },
};

/**
 * gcdI64(a, b) — greatest common divisor for i64 values.
 * Params: a (i64), b (i64). Returns i64.
 */
export const gcdI64: StdlibFunc = {
  params: ["i64", "i64"],
  results: ["i64"],
  body: function* () {
    const a = yield* param(Type.i64);
    const b = yield* param(Type.i64);
    const aa = yield* local(Type.i64, a);
    const bb = yield* local(Type.i64, b);
    const tmp = yield* local(Type.i64);
    // bb.eqz().eqz() = (i64.eqz(bb) == 0) = (bb != 0)
    yield* Ctrl.while(bb.eqz().eqz(), () => [
      tmp.set(bb),
      bb.set(Op.i64.rem_u(aa, bb)),
      aa.set(tmp),
    ]);
    return aa;
  },
};
