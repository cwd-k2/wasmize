import { param, local, Type } from "../dsl/declarations";
import { Mem, Ctrl } from "../dsl/namespaces";
import type { StdlibFunc } from "./index";

/**
 * memcpy(dst, src, len) — copies `len` bytes from `src` to `dst`.
 */
export const memcpy: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: [],
  body: function* () {
    const dst = yield* param(Type.i32);
    const src = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const i = yield* local(Type.i32);
    yield* Ctrl.while(i.lt(len), () => [
      Mem.store8(dst.add(i), Mem.load8(src.add(i))),
      i.incrBy(1),
    ]);
  },
};

/**
 * memset(dst, val, len) — fills `len` bytes at `dst` with `val`.
 */
export const memset: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: [],
  body: function* () {
    const dst = yield* param(Type.i32);
    const val_ = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const i = yield* local(Type.i32);
    yield* Ctrl.while(i.lt(len), () => [
      Mem.store8(dst.add(i), val_),
      i.incrBy(1),
    ]);
  },
};

/**
 * memcmp(a, b, len) — compares `len` bytes at `a` and `b`.
 * Returns 0 if equal, negative if a < b, positive if a > b.
 */
export const memcmp: StdlibFunc = {
  params: ["i32", "i32", "i32"],
  results: ["i32"],
  body: function* () {
    const a = yield* param(Type.i32);
    const b = yield* param(Type.i32);
    const len = yield* param(Type.i32);
    const i = yield* local(Type.i32);
    const result = yield* local(Type.i32);
    // Loop while i < len AND result is still 0
    yield* Ctrl.while(i.lt(len).and(result.eq(0)), () => [
      result.set(Mem.load8(a.add(i)).sub(Mem.load8(b.add(i)))),
      i.incrBy(1),
    ]);
    return result;
  },
};
