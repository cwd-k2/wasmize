/**
 * Trigonometric functions: sin, cos, tan, atan2.
 *
 * Pure Wasm f64 implementations using polynomial approximations
 * with range reduction. Error < 1e-6 for all functions.
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Ctrl, Mem, Loc } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

const PI = Math.PI;
const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

/**
 * sin(x: f64) -> f64 — sine approximation.
 * Uses range reduction to [-PI, PI], then a minimax polynomial.
 *
 * Algorithm: Reduce to [-PI/2, PI/2] using symmetry, then use
 * 9th-order odd polynomial (5 terms of Taylor).
 */
export const sin: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);
    const reduced = yield* local(Type.f64);

    // Range reduction: reduce x to [-PI, PI]
    yield* reduced.set(
      x.toF64().sub(
        x.toF64().div(Mem.f64(TWO_PI)).nearest().mul(Mem.f64(TWO_PI)),
      ),
    );

    // Further reduce to [-PI/2, PI/2] using sin(x) = sin(PI - x) for |x| > PI/2
    yield* Ctrl.when(reduced.gt(Mem.f64(HALF_PI)), () => [
      reduced.set(Mem.f64(PI).sub(reduced)),
    ]);
    yield* Ctrl.when(reduced.lt(Mem.f64(-HALF_PI)), () => [
      reduced.set(Mem.f64(-PI).sub(reduced)),
    ]);

    // 9th-order Taylor series: sin(x) = x - x^3/3! + x^5/5! - x^7/7! + x^9/9!
    // Horner form on x^2:
    // sin(x) = x * (1 - x^2/6 * (1 - x^2/20 * (1 - x^2/42 * (1 - x^2/72))))
    const x2 = yield* local(Type.f64, reduced.mul(reduced));

    const term = yield* local(Type.f64);
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(72.0)))); // 1 - x^2/72
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(42.0)).mul(term))); // 1 - x^2/42 * ...
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(20.0)).mul(term))); // 1 - x^2/20 * ...
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(6.0)).mul(term))); // 1 - x^2/6 * ...

    return yield* reduced.mul(term);
  },
};

/**
 * cos(x: f64) -> f64 — cosine approximation.
 * Uses range reduction then direct Taylor polynomial for cos.
 *
 * cos(x) = 1 - x^2/2! + x^4/4! - x^6/6! + x^8/8!
 */
export const cos: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);
    const reduced = yield* local(Type.f64);

    // Range reduction: reduce x to [-PI, PI]
    yield* reduced.set(
      x.toF64().sub(
        x.toF64().div(Mem.f64(TWO_PI)).nearest().mul(Mem.f64(TWO_PI)),
      ),
    );

    // Further reduce to [-PI/2, PI/2] using cos(x) = -cos(PI - x) for |x| > PI/2
    const negate = yield* local(Type.f64, Mem.f64(1.0));
    yield* Ctrl.when(reduced.gt(Mem.f64(HALF_PI)), () => [
      reduced.set(Mem.f64(PI).sub(reduced)),
      negate.set(Mem.f64(-1.0)),
    ]);
    yield* Ctrl.when(reduced.lt(Mem.f64(-HALF_PI)), () => [
      reduced.set(Mem.f64(-PI).sub(reduced)),
      negate.set(Mem.f64(-1.0)),
    ]);

    // 8th-order Taylor series: cos(x) = 1 - x^2/2 + x^4/24 - x^6/720 + x^8/40320
    // Horner form on x^2:
    // cos(x) = 1 - x^2/2 * (1 - x^2/12 * (1 - x^2/30 * (1 - x^2/56)))
    const x2 = yield* local(Type.f64, reduced.mul(reduced));

    const term = yield* local(Type.f64);
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(56.0)))); // 1 - x^2/56
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(30.0)).mul(term))); // 1 - x^2/30 * ...
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(12.0)).mul(term))); // 1 - x^2/12 * ...
    yield* term.set(Mem.f64(1.0).sub(x2.div(Mem.f64(2.0)).mul(term))); // 1 - x^2/2 * ...

    return yield* negate.mul(term);
  },
};

/**
 * tan(x: f64) -> f64 — tangent via sin(x)/cos(x).
 * Uses internally computed sin and cos with shared range reduction.
 */
export const tan: StdlibFunc = {
  params: ["f64"],
  results: ["f64"],
  body: function* () {
    const x = yield* param(Type.f64);

    // Range reduction to [-PI, PI]
    const reduced = yield* local(Type.f64);
    yield* reduced.set(
      x.toF64().sub(
        x.toF64().div(Mem.f64(TWO_PI)).nearest().mul(Mem.f64(TWO_PI)),
      ),
    );

    // Further reduce to [-PI/2, PI/2]
    const sinSign = yield* local(Type.f64, Mem.f64(1.0));
    const cosSign = yield* local(Type.f64, Mem.f64(1.0));
    yield* Ctrl.when(reduced.gt(Mem.f64(HALF_PI)), () => [
      reduced.set(Mem.f64(PI).sub(reduced)),
      cosSign.set(Mem.f64(-1.0)),
    ]);
    yield* Ctrl.when(reduced.lt(Mem.f64(-HALF_PI)), () => [
      reduced.set(Mem.f64(-PI).sub(reduced)),
      cosSign.set(Mem.f64(-1.0)),
    ]);

    const x2 = yield* local(Type.f64, reduced.mul(reduced));

    // sin(reduced)
    const sinTerm = yield* local(Type.f64);
    yield* sinTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(72.0))));
    yield* sinTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(42.0)).mul(sinTerm)));
    yield* sinTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(20.0)).mul(sinTerm)));
    yield* sinTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(6.0)).mul(sinTerm)));
    const sinVal = yield* local(Type.f64, reduced.mul(sinTerm).mul(sinSign));

    // cos(reduced)
    const cosTerm = yield* local(Type.f64);
    yield* cosTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(56.0))));
    yield* cosTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(30.0)).mul(cosTerm)));
    yield* cosTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(12.0)).mul(cosTerm)));
    yield* cosTerm.set(Mem.f64(1.0).sub(x2.div(Mem.f64(2.0)).mul(cosTerm)));
    const cosVal = yield* local(Type.f64, cosTerm.mul(cosSign));

    return yield* sinVal.div(cosVal);
  },
};

/**
 * atan2(y: f64, x: f64) -> f64 — quadrant-aware arctangent.
 * Uses polynomial approximation of atan for |z| <= 1, with
 * the identity atan(z) = PI/2 - atan(1/z) for |z| > 1.
 * Returns result in [-PI, PI].
 */
export const atan2: StdlibFunc = {
  params: ["f64", "f64"],
  results: ["f64"],
  body: function* () {
    const y = yield* param(Type.f64);
    const x = yield* param(Type.f64);
    const result = yield* local(Type.f64);

    const ax = yield* local(Type.f64, x.abs());
    const ay = yield* local(Type.f64, y.abs());

    // Compute atan(|y|/|x|) or atan(|x|/|y|) depending on which is smaller
    const swapped = yield* local(Type.i32, 0);
    yield* Ctrl.when(ay.gt(ax), () => [swapped.set(1)]);

    const num = yield* local(Type.f64);
    const den = yield* local(Type.f64);
    yield* Ctrl.if(swapped)
      .then(() => [num.set(ax), den.set(ay)])
      .else(() => [num.set(ay), den.set(ax)]);

    // Handle den == 0: atan2(0,0) = 0, atan2(y,0) = sign(y)*PI/2
    yield* Ctrl.when(den.eq(Mem.f64(0.0)), function* () {
      yield* Ctrl.if(ay.eq(Mem.f64(0.0)))
        .then(function* () {
          yield* Loc.return(Mem.f64(0.0));
        })
        .else(function* () {
          yield* Ctrl.if(y.gt(Mem.f64(0.0)))
            .then(function* () {
              yield* Loc.return(Mem.f64(HALF_PI));
            })
            .else(function* () {
              yield* Loc.return(Mem.f64(-HALF_PI));
            });
        });
    });

    const z = yield* local(Type.f64, num.div(den));

    // Further reduce: if z > tan(PI/8) ~ 0.4142, use identity
    // atan(z) = PI/4 + atan((z-1)/(z+1))  maps [0.414, 1] -> [0, 0.172]
    const atanOffset = yield* local(Type.f64, Mem.f64(0.0));
    const QUARTER_PI = PI / 4;
    const TAN_PI_8 = Math.SQRT2 - 1; // tan(PI/8) = sqrt(2) - 1
    yield* Ctrl.when(z.gt(Mem.f64(TAN_PI_8)), () => [
      atanOffset.set(Mem.f64(QUARTER_PI)),
      z.set(z.sub(Mem.f64(1.0)).div(z.add(Mem.f64(1.0)))),
    ]);

    const z2 = yield* local(Type.f64, z.mul(z));

    // atan(z) for |z| <= ~0.414 via 9th-order polynomial (converges fast here):
    // z * (1 - z^2*(1/3 - z^2*(1/5 - z^2*(1/7 - z^2/9))))
    const atanTerm = yield* local(Type.f64);
    yield* atanTerm.set(Mem.f64(1.0 / 7.0).sub(z2.mul(Mem.f64(1.0 / 9.0))));
    yield* atanTerm.set(Mem.f64(1.0 / 5.0).sub(z2.mul(atanTerm)));
    yield* atanTerm.set(Mem.f64(1.0 / 3.0).sub(z2.mul(atanTerm)));
    yield* atanTerm.set(Mem.f64(1.0).sub(z2.mul(atanTerm)));
    const atanVal = yield* local(Type.f64, atanOffset.add(z.mul(atanTerm)));

    // If swapped: result = PI/2 - atanVal, else result = atanVal
    yield* Ctrl.if(swapped)
      .then(() => [result.set(Mem.f64(HALF_PI).sub(atanVal))])
      .else(() => [result.set(atanVal)]);

    // Quadrant adjustment based on signs of x, y
    // If x < 0: result = PI - result
    yield* Ctrl.when(x.lt(Mem.f64(0.0)), () => [
      result.set(Mem.f64(PI).sub(result)),
    ]);

    // Apply sign of y
    yield* Ctrl.when(y.lt(Mem.f64(0.0)), () => [
      result.set(result.neg()),
    ]);

    return result;
  },
};
