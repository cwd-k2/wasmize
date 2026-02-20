import { describe, test, expect } from "vitest";
import { compile } from "../../dsl/compiler";
import { Type, Mod } from "../../dsl/primitives";
import { instantiate } from "../../test-helpers";
import { pow, clamp, abs, lerp } from "../math";

describe("stdlib/math", () => {
  test("pow computes integer exponentiation", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const p = yield* Mod.use(pow);
      yield* Mod.exportFunc("pow", { base: Type.i32, exp: Type.i32 }, function* (base, exp) {
        return yield* p(base, exp);
      });
    });

    const { exports } = await instantiate(binary);
    const fn = exports.pow as Function;
    expect(fn(2, 0)).toBe(1);
    expect(fn(2, 1)).toBe(2);
    expect(fn(2, 10)).toBe(1024);
    expect(fn(3, 5)).toBe(243);
    expect(fn(5, 3)).toBe(125);
  });

  test("clamp restricts value to range", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const c = yield* Mod.use(clamp);
      yield* Mod.exportFunc(
        "clamp",
        { v: Type.i32, lo: Type.i32, hi: Type.i32 },
        function* (v, lo, hi) {
          return yield* c(v, lo, hi);
        },
      );
    });

    const { exports } = await instantiate(binary);
    const fn = exports.clamp as Function;
    expect(fn(5, 0, 10)).toBe(5);
    expect(fn(-5, 0, 10)).toBe(0);
    expect(fn(15, 0, 10)).toBe(10);
    expect(fn(0, 0, 10)).toBe(0);
    expect(fn(10, 0, 10)).toBe(10);
  });

  test("abs computes absolute value", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const a = yield* Mod.use(abs);
      yield* Mod.exportFunc("abs", { v: Type.i32 }, function* (v) {
        return yield* a(v);
      });
    });

    const { exports } = await instantiate(binary);
    const fn = exports.abs as Function;
    expect(fn(5)).toBe(5);
    expect(fn(-5)).toBe(5);
    expect(fn(0)).toBe(0);
    expect(fn(-1)).toBe(1);
  });

  test("lerp performs linear interpolation", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const l = yield* Mod.use(lerp);
      // Export directly — avoids inferType defaulting call result to i32
      yield* Mod.export("lerp", l);
    });

    const { exports } = await instantiate(binary);
    const fn = exports.lerp as Function;
    expect(fn(0, 10, 0)).toBeCloseTo(0);
    expect(fn(0, 10, 1)).toBeCloseTo(10);
    expect(fn(0, 10, 0.5)).toBeCloseTo(5);
    expect(fn(2, 8, 0.25)).toBeCloseTo(3.5);
  });
});
