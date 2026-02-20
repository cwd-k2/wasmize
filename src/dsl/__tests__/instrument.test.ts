import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { param, local, Type, Mod, Mem, Ctrl } from "../primitives";
import { instantiate } from "../../test-helpers";
import { createProfile, withProfiling } from "../instrument";

describe("withProfiling", () => {
  test("counts params and locals", () => {
    const profile = createProfile();

    compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* withProfiling(
          (function* () {
            const a = yield* param(Type.i32);
            const b = yield* param(Type.i32);
            const tmp = yield* local(Type.i32);
            yield* tmp.set(yield* a.add(b));
            return tmp;
          })(),
          profile,
        );
      });
      yield* Mod.export("add", fn);
    });

    expect(profile.params).toBe(2);
    expect(profile.locals).toBe(1);
    expect(profile.decls).toBe(3);
    expect(profile.stmts).toBe(1); // tmp.set(...)
    expect(profile.total).toBe(4);
  });

  test("counts ifs and blocks", () => {
    const profile = createProfile();

    compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        return yield* withProfiling(
          (function* () {
            const n = yield* param(Type.i32);
            const i = yield* local(Type.i32);
            yield* Ctrl.if(n)
              .then(function* () { yield* i.set(yield* Mem.i32(1)); })
              .else(function* () { yield* i.set(yield* Mem.i32(0)); });
            // Ctrl.while yields a "block" at top level (loop is in sub-body)
            yield* Ctrl.while(i.lt(n), function* () {
              yield* i.incrBy(1);
            });
            return i;
          })(),
          profile,
        );
      });
      yield* Mod.export("f", fn);
    });

    expect(profile.ifs).toBe(1);
    // Ctrl.while yields a block wrapping a loop; loop is in sub-body (not intercepted)
    expect(profile.blocks).toBe(1);
    expect(profile.params).toBe(1);
    expect(profile.locals).toBe(1);
  });

  test("does not alter binary output", async () => {
    const profile = createProfile();

    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        return yield* withProfiling(
          (function* () {
            const x = yield* param(Type.i32);
            return yield* x.mul(2);
          })(),
          profile,
        );
      });
      yield* Mod.export("double", fn);
    });

    const { exports: { double } } = await instantiate(binary);
    expect((double as Function)(21)).toBe(42);
    expect(profile.total).toBeGreaterThan(0);
  });
});

describe("createProfile", () => {
  test("returns all zeros", () => {
    const p = createProfile();
    expect(p.total).toBe(0);
    expect(p.decls).toBe(0);
    expect(p.stmts).toBe(0);
    expect(p.ifs).toBe(0);
    expect(p.loops).toBe(0);
    expect(p.blocks).toBe(0);
  });
});
