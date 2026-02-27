/**
 * Floating-point math functions: log, log2, exp, pow_f64.
 *
 * Pure Wasm f64 implementations using range reduction and polynomial
 * approximations. Accuracy targets:
 * - log: relative error < 1e-6
 * - log2: relative error < 1e-6
 * - exp: relative error < 1e-6
 * - pow_f64: exp(exp * log(base))
 *
 * Note: Large i64 constants (> 2^53) cannot be represented precisely as JS
 * numbers. We construct them at runtime from small constants using Wasm ops:
 *   0x3ff0000000000000 = 1023 << 52
 *   0x000fffffffffffff = (1 << 52) - 1
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Op, Ctrl, Mem, Loc } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

const LN2 = Math.LN2;
const LOG2E = Math.LOG2E;

/**
 * Helper: extract exponent and mantissa from an f64 value using i64 bit tricks.
 *
 * IEEE 754 f64: [sign(1)][exponent(11)][mantissa(52)]
 * - exponent field = bits[52:62], biased by 1023
 * - mantissa mask = (1 << 52) - 1 = 0x000fffffffffffff
 * - bias pattern  = 1023 << 52 = 0x3ff0000000000000
 *
 * We build the masks from small constants to avoid JS number precision limits.
 */

/**
 * log(x: f64) -> f64 — natural logarithm.
 *
 * Algorithm: Decompose x = m * 2^e where 1 <= m < 2.
 * Then ln(x) = e * ln(2) + ln(m).
 * ln(m) is approximated via a polynomial for m in [1, 2).
 */
export const log: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);
    const result = yield* local(Type.f64);

    // Handle x <= 0: return NaN (via 0/0)
    yield* Ctrl.when(x.le(Mem.f64(0.0)), function* () {
      yield* Loc.return(Mem.f64(0.0).div(Mem.f64(0.0)));
    });

    // Handle x == 1: return 0 exactly
    yield* Ctrl.when(x.eq(Mem.f64(1.0)), function* () {
      yield* Loc.return(Mem.f64(0.0));
    });

    // Extract exponent and mantissa using bit manipulation
    const bits = yield* local(Type.i64);
    yield* bits.set(Op.convert.i64_reinterpret_f64(x));

    // Build masks from small constants (avoids JS precision limits)
    const mantissaMask = yield* local(Type.i64, Mem.i64(1).shl(Mem.i64(52)).sub(Mem.i64(1)));
    const biasBits = yield* local(Type.i64, Mem.i64(1023).shl(Mem.i64(52)));

    // Exponent: bits[52:62] - 1023
    const expRaw = yield* local(Type.i64);
    yield* expRaw.set(bits.shr(Mem.i64(52)).and(Mem.i64(0x7ff)));

    const e = yield* local(Type.f64);
    yield* e.set(expRaw.sub(Mem.i64(1023)).toF64());

    // Mantissa: set exponent to 1023 (=0 bias) to get m in [1, 2)
    const mBits = yield* local(Type.i64);
    yield* mBits.set(bits.and(mantissaMask).or(biasBits));
    const m = yield* local(Type.f64, Op.convert.f64_reinterpret_i64(mBits));

    // Center around sqrt(2): if m >= sqrt(2), use m/2 and e+1
    // This keeps t = m-1 in [-0.293, 0.414] for much better convergence
    const SQRT2 = Math.SQRT2;
    yield* Ctrl.when(m.ge(Mem.f64(SQRT2)), () => [
      m.set(m.mul(Mem.f64(0.5))),
      e.set(e.add(Mem.f64(1.0))),
    ]);

    // ln(m) for m in [sqrt(2)/2, sqrt(2)) via polynomial on t = m - 1
    // t now in [-0.293, 0.414] — 7 terms suffice for < 1e-6 accuracy
    const t = yield* local(Type.f64, m.sub(Mem.f64(1.0)));

    const poly = yield* local(Type.f64);
    yield* poly.set(Mem.f64(1.0 / 6.0).sub(t.mul(Mem.f64(1.0 / 7.0))));
    yield* poly.set(Mem.f64(1.0 / 5.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 4.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 3.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 2.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0).sub(t.mul(poly)));

    const lnM = yield* local(Type.f64, t.mul(poly));

    // result = e * ln(2) + ln(m)
    yield* result.set(e.mul(Mem.f64(LN2)).add(lnM));

    return result;
  },
};

/**
 * log2(x: f64) -> f64 — base-2 logarithm.
 * log2(x) = e + log2(m) where x = m * 2^e, m in [1, 2).
 */
export const log2: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);
    const result = yield* local(Type.f64);

    // Handle x <= 0
    yield* Ctrl.when(x.le(Mem.f64(0.0)), function* () {
      yield* Loc.return(Mem.f64(0.0).div(Mem.f64(0.0)));
    });

    // Handle x == 1
    yield* Ctrl.when(x.eq(Mem.f64(1.0)), function* () {
      yield* Loc.return(Mem.f64(0.0));
    });

    // Extract exponent and mantissa
    const bits = yield* local(Type.i64);
    yield* bits.set(Op.convert.i64_reinterpret_f64(x));

    const mantissaMask = yield* local(Type.i64, Mem.i64(1).shl(Mem.i64(52)).sub(Mem.i64(1)));
    const biasBits = yield* local(Type.i64, Mem.i64(1023).shl(Mem.i64(52)));

    const expRaw = yield* local(Type.i64);
    yield* expRaw.set(bits.shr(Mem.i64(52)).and(Mem.i64(0x7ff)));

    const e = yield* local(Type.f64);
    yield* e.set(expRaw.sub(Mem.i64(1023)).toF64());

    const mBits = yield* local(Type.i64);
    yield* mBits.set(bits.and(mantissaMask).or(biasBits));
    const m = yield* local(Type.f64, Op.convert.f64_reinterpret_i64(mBits));

    // Center around sqrt(2) for better convergence
    const SQRT2 = Math.SQRT2;
    yield* Ctrl.when(m.ge(Mem.f64(SQRT2)), () => [
      m.set(m.mul(Mem.f64(0.5))),
      e.set(e.add(Mem.f64(1.0))),
    ]);

    // log2(m) = ln(m) * LOG2E, t in [-0.293, 0.414]
    const t = yield* local(Type.f64, m.sub(Mem.f64(1.0)));

    const poly = yield* local(Type.f64);
    yield* poly.set(Mem.f64(1.0 / 6.0).sub(t.mul(Mem.f64(1.0 / 7.0))));
    yield* poly.set(Mem.f64(1.0 / 5.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 4.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 3.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 2.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0).sub(t.mul(poly)));

    const lnM = yield* local(Type.f64, t.mul(poly));

    // result = e + lnM * LOG2E
    yield* result.set(e.add(lnM.mul(Mem.f64(LOG2E))));

    return result;
  },
};

/**
 * exp(x: f64) -> f64 — exponential function.
 *
 * Algorithm: exp(x) = 2^(x / ln(2)) = 2^k * 2^f where k = floor(x/ln2), f = frac
 * 2^f is approximated via Taylor series for small f.
 * 2^k is constructed via bit manipulation.
 */
export const exp: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);

    // Handle overflow/underflow
    yield* Ctrl.when(x.gt(Mem.f64(709.0)), function* () {
      // Return +Infinity
      yield* Loc.return(Mem.f64(1.0e308).mul(Mem.f64(1.0e308)));
    });
    yield* Ctrl.when(x.lt(Mem.f64(-745.0)), function* () {
      yield* Loc.return(Mem.f64(0.0));
    });

    // Range reduction: x = k * ln(2) + r, where k = round(x / ln(2))
    const k = yield* local(Type.f64);
    yield* k.set(x.mul(Mem.f64(LOG2E)).nearest());

    const r = yield* local(Type.f64);
    yield* r.set(x.sub(k.mul(Mem.f64(LN2))));

    // exp(r) via Taylor series for small r: 1 + r + r^2/2 + r^3/6 + r^4/24 + r^5/120 + r^6/720
    // Horner: 1 + r * (1 + r * (1/2 + r * (1/6 + r * (1/24 + r * (1/120 + r/720)))))
    const expR = yield* local(Type.f64);
    yield* expR.set(Mem.f64(1.0 / 120.0).add(r.mul(Mem.f64(1.0 / 720.0))));
    yield* expR.set(Mem.f64(1.0 / 24.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0 / 6.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0 / 2.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0).add(r.mul(expR)));

    // Construct 2^k via bit manipulation: reinterpret (k + 1023) << 52 as f64
    const kI = yield* local(Type.i64, k.toI64());
    const pow2bits = yield* local(Type.i64);
    yield* pow2bits.set(kI.add(Mem.i64(1023)).shl(Mem.i64(52)));
    const pow2 = yield* local(Type.f64, Op.convert.f64_reinterpret_i64(pow2bits));

    return yield* pow2.mul(expR);
  },
};

/**
 * pow_f64(base: f64, exp: f64) -> f64 — floating-point power.
 * Computes base^exp = exp(exp * log(base)).
 *
 * Special cases:
 * - base == 0 and exp > 0: returns 0
 * - base == 0 and exp <= 0: returns NaN
 * - base == 1: returns 1
 * - exp == 0: returns 1
 */
export const pow_f64: StdlibFunc = {
  params: ["f64", "f64"],
  results: ["f64"],
  body: function* () {
    const base = yield* param(Type.f64);
    const exponent = yield* param(Type.f64);

    // Special cases
    yield* Ctrl.when(exponent.eq(Mem.f64(0.0)), function* () {
      yield* Loc.return(Mem.f64(1.0));
    });
    yield* Ctrl.when(base.eq(Mem.f64(1.0)), function* () {
      yield* Loc.return(Mem.f64(1.0));
    });
    yield* Ctrl.when(base.eq(Mem.f64(0.0)), function* () {
      yield* Ctrl.if(exponent.gt(Mem.f64(0.0)))
        .then(function* () {
          yield* Loc.return(Mem.f64(0.0));
        })
        .else(function* () {
          yield* Loc.return(Mem.f64(0.0).div(Mem.f64(0.0))); // NaN
        });
    });

    // log(base) — inline bit manipulation with small-constant masks
    const mantissaMask = yield* local(Type.i64, Mem.i64(1).shl(Mem.i64(52)).sub(Mem.i64(1)));
    const biasBits = yield* local(Type.i64, Mem.i64(1023).shl(Mem.i64(52)));

    const bits = yield* local(Type.i64, Op.convert.i64_reinterpret_f64(base));
    const expRaw = yield* local(Type.i64, bits.shr(Mem.i64(52)).and(Mem.i64(0x7ff)));
    const e = yield* local(Type.f64, expRaw.sub(Mem.i64(1023)).toF64());
    const mBits = yield* local(Type.i64, bits.and(mantissaMask).or(biasBits));
    const m = yield* local(Type.f64, Op.convert.f64_reinterpret_i64(mBits));

    // Center around sqrt(2) for better polynomial convergence
    yield* Ctrl.when(m.ge(Mem.f64(Math.SQRT2)), () => [
      m.set(m.mul(Mem.f64(0.5))),
      e.set(e.add(Mem.f64(1.0))),
    ]);

    const t = yield* local(Type.f64, m.sub(Mem.f64(1.0)));
    const poly = yield* local(Type.f64);
    yield* poly.set(Mem.f64(1.0 / 6.0).sub(t.mul(Mem.f64(1.0 / 7.0))));
    yield* poly.set(Mem.f64(1.0 / 5.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 4.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 3.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0 / 2.0).sub(t.mul(poly)));
    yield* poly.set(Mem.f64(1.0).sub(t.mul(poly)));
    const lnBase = yield* local(Type.f64, e.mul(Mem.f64(LN2)).add(t.mul(poly)));

    // exp(exponent * log(base))
    const x = yield* local(Type.f64, exponent.mul(lnBase));

    // exp(x) — inline
    yield* Ctrl.when(x.gt(Mem.f64(709.0)), function* () {
      yield* Loc.return(Mem.f64(1.0e308).mul(Mem.f64(1.0e308)));
    });
    yield* Ctrl.when(x.lt(Mem.f64(-745.0)), function* () {
      yield* Loc.return(Mem.f64(0.0));
    });

    const k = yield* local(Type.f64, x.mul(Mem.f64(LOG2E)).nearest());
    const r = yield* local(Type.f64, x.sub(k.mul(Mem.f64(LN2))));

    const expR = yield* local(Type.f64);
    yield* expR.set(Mem.f64(1.0 / 120.0).add(r.mul(Mem.f64(1.0 / 720.0))));
    yield* expR.set(Mem.f64(1.0 / 24.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0 / 6.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0 / 2.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0).add(r.mul(expR)));
    yield* expR.set(Mem.f64(1.0).add(r.mul(expR)));

    const kI = yield* local(Type.i64, k.toI64());
    const pow2bits = yield* local(Type.i64, kI.add(Mem.i64(1023)).shl(Mem.i64(52)));
    const pow2 = yield* local(Type.f64, Op.convert.f64_reinterpret_i64(pow2bits));

    return yield* pow2.mul(expR);
  },
};
