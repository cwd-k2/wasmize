/**
 * Q16.16 fixed-point arithmetic helpers.
 *
 * All values are i32 with 16 integer bits and 16 fractional bits.
 * Multiply/divide use i64 intermediates to avoid overflow.
 *
 * @module
 */
import { param, Type } from "../dsl/declarations";
import { Op, Mem } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * fixedFromInt(n) — converts an integer to Q16.16 fixed-point.
 * Params: n (i32). Returns i32 (n << 16).
 */
export const fixedFromInt: StdlibFunc = {
  params: ["i32"],
  results: ["i32"],
  body: function* () {
    const n = yield* param(Type.i32);
    return yield* n.shl(16);
  },
};

/**
 * fixedFromF64(f) — converts f64 to Q16.16 fixed-point.
 * Params: f (f64). Returns i32 (trunc(f * 65536.0)).
 */
export const fixedFromF64: StdlibFunc = {
  params: ["f64"],
  results: ["i32"],
  body: function* () {
    const f = yield* param(Type.f64);
    return yield* Op.truncI32(f.mul(Mem.f64(65536.0)));
  },
};

/**
 * fixedToF64(fx) — converts Q16.16 fixed-point to f64.
 * Params: fx (i32). Returns f64 (fx / 65536.0).
 */
export const fixedToF64: StdlibFunc = {
  params: ["i32"],
  results: ["f64"],
  body: function* () {
    const fx = yield* param(Type.i32);
    return yield* fx.toF64().div(Mem.f64(65536.0));
  },
};

/**
 * fixedAdd(a, b) — adds two Q16.16 values.
 * Params: a (i32), b (i32). Returns i32 (plain add).
 */
export const fixedAdd: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    return yield* a.add(b);
  },
};

/**
 * fixedSub(a, b) — subtracts two Q16.16 values.
 * Params: a (i32), b (i32). Returns i32 (plain sub).
 */
export const fixedSub: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    return yield* a.sub(b);
  },
};

/**
 * fixedMul(a, b) — multiplies two Q16.16 values.
 * Params: a (i32), b (i32). Returns i32.
 * Uses i64 intermediate: (extend(a) * extend(b)) >> 16, then wrap to i32.
 */
export const fixedMul: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    // Extend both to i64, multiply, shift right 16, wrap back to i32
    const a64 = yield* Op.extend(a);
    const b64 = yield* Op.extend(b);
    const product = yield* Op.i64.mul(a64, b64);
    const shifted = yield* Op.i64.shr(product, Mem.i64(16));
    return yield* Op.wrap(shifted);
  },
};

/**
 * fixedDiv(a, b) — divides two Q16.16 values.
 * Params: a (i32), b (i32). Returns i32.
 * Uses i64 intermediate: (extend(a) << 16) / extend(b), then wrap to i32.
 */
export const fixedDiv: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    // Extend a to i64, shift left 16, divide by extended b, wrap to i32
    const a64 = yield* Op.extend(a);
    const b64 = yield* Op.extend(b);
    const shifted = yield* Op.i64.shl(a64, Mem.i64(16));
    const quotient = yield* Op.i64.div(shifted, b64);
    return yield* Op.wrap(quotient);
  },
};
