import { param, local, Type } from "../dsl/declarations";
import { Mod, Op, Mem } from "../dsl/namespaces";
import { set, shr_u, rem_u } from "../dsl/expr";
import type { CallableFunc } from "../dsl/expr";
import type { ModuleGen } from "../dsl/types";

export interface PrngHandle {
  /** Sets the PRNG seed. */
  seed: CallableFunc;
  /** Returns the next i32 random value (Xorshift32). */
  next: CallableFunc;
  /** Returns a random i32 in [min, max). */
  nextInRange: CallableFunc;
  /** Returns a random f64 in [0.0, 1.0). */
  nextF64: CallableFunc;
}

/**
 * Creates a Xorshift32 PRNG backed by a Wasm mutable global.
 *
 * Usage: `const prng = yield* usePrng()` at module level.
 * Returns callable functions: seed, next, nextInRange, nextF64.
 */
export function usePrng(): ModuleGen<PrngHandle> {
  return (function* () {
    const state = yield* Mod.global("i32", 1, true);

    // seed(s: i32): void
    const seedFn = yield* Mod.func(function* () {
      const s = yield* param(Type.i32);
      yield* state.set(s);
    });

    // next(): i32 — Xorshift32
    const nextFn = yield* Mod.func(function* () {
      const x = yield* local(Type.i32, state.get());
      // x ^= x << 13
      yield* set(x, x.xor(x.shl(13)));
      // x ^= x >>> 17 (unsigned right shift)
      yield* set(x, x.xor(shr_u(x, 17)));
      // x ^= x << 5
      yield* set(x, x.xor(x.shl(5)));
      yield* state.set(x);
      return x;
    });

    // nextInRange(min, max): i32 — [min, max)
    const nextInRangeFn = yield* Mod.func(function* () {
      const min = yield* param(Type.i32);
      const max = yield* param(Type.i32);
      const raw = yield* local(Type.i32, nextFn());
      const range = yield* local(Type.i32, max.sub(min));
      // Use unsigned remainder to get [0, range), then add min
      return yield* local(Type.i32, Op.add(rem_u(raw, range), min));
    });

    // nextF64(): f64 — [0.0, 1.0)
    const nextF64Fn = yield* Mod.func(function* () {
      const raw = yield* local(Type.i32, nextFn());
      // Mask to positive i32 (clear sign bit), convert to f64, divide by 2^31
      const positive = yield* local(Type.i32, raw.and(0x7fffffff));
      return yield* local(Type.f64, Op.f64.div(positive.toF64(), Mem.f64(2147483648.0)));
    });

    return {
      seed: seedFn,
      next: nextFn,
      nextInRange: nextInRangeFn,
      nextF64: nextF64Fn,
    };
  })() as ModuleGen<PrngHandle>;
}
