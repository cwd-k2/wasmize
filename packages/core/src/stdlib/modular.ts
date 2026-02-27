/**
 * Modular arithmetic helpers.
 *
 * - `modpow(base, exp, mod)` — modular exponentiation via repeated squaring
 * - `modinv(a, m)` — modular inverse via extended Euclidean algorithm
 *
 * @module
 */
import { param, local, Type } from "../dsl/declarations";
import { Op, Ctrl } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * modpow(base, exp, mod) — computes (base^exp) % mod via repeated squaring.
 * Params: base (i32), exp (i32), mod (i32). Returns i32.
 * Uses i64 intermediates to avoid overflow in multiplications.
 */
export const modpow: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const base = yield* param(Type.i32);
    const exp = yield* param(Type.i32);
    const mod = yield* param(Type.i32);
    const result = yield* local(Type.i32, 1);
    const b = yield* local(Type.i32, Op.rem_u(base, mod));
    const e = yield* local(Type.i32, exp);

    // Square-and-multiply with i64 intermediates
    yield* Ctrl.while(e.gt(0), function* () {
      yield* Ctrl.when(e.and(1), function* () {
        // result = (result * b) % mod via i64
        const r64 = yield* Op.extend(result);
        const b64 = yield* Op.extend(b);
        const prod = yield* Op.i64.mul(r64, b64);
        const mod64 = yield* Op.extend(mod);
        const rem = yield* Op.i64.rem_u(prod, mod64);
        yield* result.set(Op.wrap(rem));
      });
      // b = (b * b) % mod via i64
      const b64a = yield* Op.extend(b);
      const b64b = yield* Op.extend(b);
      const sq = yield* Op.i64.mul(b64a, b64b);
      const mod64 = yield* Op.extend(mod);
      const sqRem = yield* Op.i64.rem_u(sq, mod64);
      yield* b.set(Op.wrap(sqRem));
      yield* e.shrBy(1);
    });
    return result;
  },
};

/**
 * modinv(a, m) — computes the modular inverse of a mod m.
 * Uses the extended Euclidean algorithm.
 * Returns a^(-1) mod m. Behavior is undefined if gcd(a, m) != 1.
 * Params: a (i32), m (i32). Returns i32.
 */
export const modinv: StdlibFunc = {
  params: ["i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const m = yield* param(Type.i32);

    // Extended Euclidean: maintain old_r, r, old_s, s
    const old_r = yield* local(Type.i32, a);
    const r = yield* local(Type.i32, m);
    const old_s = yield* local(Type.i32, 1);
    const s = yield* local(Type.i32, 0);
    const tmp = yield* local(Type.i32);
    const q = yield* local(Type.i32);

    yield* Ctrl.while(r.ne(0), () => [
      q.set(old_r.div(r)),
      // (old_r, r) = (r, old_r - q * r)
      tmp.set(r),
      r.set(old_r.sub(q.mul(r))),
      old_r.set(tmp),
      // (old_s, s) = (s, old_s - q * s)
      tmp.set(s),
      s.set(old_s.sub(q.mul(s))),
      old_s.set(tmp),
    ]);

    // old_s might be negative, normalize: (old_s % m + m) % m
    const result = yield* local(Type.i32);
    yield* result.set(Op.rem(old_s, m));
    yield* result.incrBy(m);
    yield* result.set(Op.rem_u(result, m));
    return result;
  },
};
