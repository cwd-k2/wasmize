import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Ctrl, Op } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";

// === D-01: Short-circuit Evaluation ===

describe("D-01: Short-circuit Evaluation", () => {
  test("Ctrl.logicalAnd: short-circuits on false", async () => {
    // logicalAnd(0, x) should return 0 without evaluating x
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Ctrl.logicalAnd(a, b);
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (a: number, b: number) => number;
    expect(f(0, 42)).toBe(0); // short-circuit: a is 0
    expect(f(1, 0)).toBe(0); // a is truthy, b is 0
    expect(f(1, 1)).toBe(1); // both truthy
    expect(f(5, 3)).toBe(3); // both truthy → returns b as-is
  });

  test("Ctrl.logicalOr: short-circuits on true", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Ctrl.logicalOr(a, b);
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (a: number, b: number) => number;
    expect(f(1, 0)).toBe(1); // short-circuit: a is truthy
    expect(f(0, 1)).toBe(1); // a is 0, b is truthy
    expect(f(0, 0)).toBe(0); // both falsy
  });

  test("ChainableExpr.logicalAnd / logicalOr chaining", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { a: Type.i32, b: Type.i32, c: Type.i32 }, function* (a, b, c) {
        // (a && b) || c — using Ctrl helpers for first op, then chain
        return yield* Ctrl.logicalAnd(a, b).logicalOr(c);
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (a: number, b: number, c: number) => number;
    expect(f(1, 1, 0)).toBe(1); // (1 && 1) || 0 = 1
    expect(f(0, 1, 0)).toBe(0); // (0 && 1) || 0 = 0
    expect(f(0, 1, 1)).toBe(1); // (0 && 1) || 1 = 1
  });
});

// === D-05: Loop with break/continue ===

describe("D-05: Loop with break/continue", () => {
  test("Ctrl.while with break", async () => {
    // Sum 1..10 but break at 5
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const i = yield* local(Type.i32, 0);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.while(
          i.lt(10),
          (loop) =>
            function* () {
              yield* i.incrBy(1);
              yield* Ctrl.when(i.eq(6), function* () {
                yield* loop.break();
              });
              yield* sum.incrBy(i);
            }(),
        );
        return sum; // 1+2+3+4+5 = 15
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)()).toBe(15);
  });

  test("Ctrl.while with continue", async () => {
    // Sum 1..10 but skip even numbers
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const i = yield* local(Type.i32, 0);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.while(
          i.lt(10),
          (loop) =>
            function* () {
              yield* i.incrBy(1);
              // Skip even
              yield* Ctrl.when(Op.eq(Op.rem(i, 2), 0), function* () {
                yield* loop.continue();
              });
              yield* sum.incrBy(i);
            }(),
        );
        return sum; // 1+3+5+7+9 = 25
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)()).toBe(25);
  });

  test("Ctrl.for with break", async () => {
    // Sum 0..9 but break when i >= 5
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const i = yield* local(Type.i32);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.for(
          i,
          0,
          i.lt(10),
          i.add(1),
          (loop) =>
            function* () {
              yield* Ctrl.when(i.ge(5), function* () {
                yield* loop.break();
              });
              yield* sum.incrBy(i);
            }(),
        );
        return sum; // 0+1+2+3+4 = 10
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)()).toBe(10);
  });

  test("backward compatible: while/for without loop handle", async () => {
    // Existing code without LoopHandle should still work
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const i = yield* local(Type.i32, 0);
        yield* Ctrl.while(
          i.lt(5),
          function* () {
            yield* i.incrBy(1);
          },
        );
        return i; // 5
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)()).toBe(5);
  });
});

// === D-08: Assertions ===

describe("D-08: Assertions", () => {
  test("Ctrl.assert passes when condition is true", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { n: Type.i32 }, function* (n) {
        yield* Ctrl.assert(n); // n != 0
        return n;
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)(42)).toBe(42);
  });

  test("Ctrl.assert traps when condition is false", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { n: Type.i32 }, function* (n) {
        yield* Ctrl.assert(n); // will trap if n == 0
        return n;
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect(() => (fn as Function)(0)).toThrow();
  });

  test("assertions: false strips all Ctrl.assert calls", async () => {
    const binary = compile(
      function* () {
        yield* Mod.exportFunc("test", { n: Type.i32 }, function* (n) {
          yield* Ctrl.assert(n); // should be no-op
          return n;
        });
      },
      { assertions: false },
    );
    const { exports: { test: fn } } = await instantiate(binary);
    // Should NOT trap even with n=0
    expect((fn as Function)(0)).toBe(0);
  });
});

// === W-05: Saturating Truncation ===

describe("W-05: Saturating Truncation", () => {
  test("Op.convert saturating truncation: f64 -> i32", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { x: Type.f64 }, function* (x) {
        return yield* Op.convert.i32_trunc_sat_f64_s(x);
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (x: number) => number;
    expect(f(3.7)).toBe(3);
    expect(f(-2.5)).toBe(-2);
    // Saturates to i32 max instead of trapping
    expect(f(1e15)).toBe(2147483647);
    // Saturates to i32 min
    expect(f(-1e15)).toBe(-2147483648);
    // NaN -> 0
    expect(f(NaN)).toBe(0);
  });

  test("Op.convert saturating truncation: f64 -> i32 unsigned", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { x: Type.f64 }, function* (x) {
        return yield* Op.convert.i32_trunc_sat_f64_u(x);
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (x: number) => number;
    expect(f(3.7)).toBe(3);
    // Saturates to 0 for negative
    expect(f(-1.0)).toBe(0);
    // NaN -> 0
    expect(f(NaN)).toBe(0);
  });

  test("ChainableExpr.toI32Sat()", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { x: Type.f64 }, function* (x) {
        return yield* x.toI32Sat();
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (x: number) => number;
    expect(f(42.9)).toBe(42);
    expect(f(1e15)).toBe(2147483647); // saturates
  });

  test("WasmRef.toI32Sat()", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("test", { x: Type.f64 }, function* (x) {
        return yield* x.toI32Sat();
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    const f = fn as (x: number) => number;
    expect(f(42.9)).toBe(42);
    expect(f(NaN)).toBe(0);
  });
});

// === W-10: Global Import/Export ===

describe("W-10: Global Import/Export", () => {
  test("importGlobal: read imported mutable global", async () => {
    const binary = compile(function* () {
      const counter = yield* Mod.importGlobal("env", "counter", Type.i32, true);
      yield* Mod.exportFunc("getCounter", function* () {
        return yield* counter.get();
      });
    });
    const globalObj = new WebAssembly.Global({ value: "i32", mutable: true }, 42);
    const mod = await WebAssembly.compile(binary);
    const inst = await WebAssembly.instantiate(mod, { env: { counter: globalObj } });
    const getCounter = (inst.exports.getCounter as Function);
    expect(getCounter()).toBe(42);
  });

  test("importGlobal: write to imported mutable global", async () => {
    const binary = compile(function* () {
      const counter = yield* Mod.importGlobal("env", "counter", Type.i32, true);
      yield* Mod.exportFunc("setCounter", { v: Type.i32 }, function* (v) {
        yield* counter.set(v);
      });
      yield* Mod.exportFunc("getCounter", function* () {
        return yield* counter.get();
      });
    });
    const globalObj = new WebAssembly.Global({ value: "i32", mutable: true }, 0);
    const mod = await WebAssembly.compile(binary);
    const inst = await WebAssembly.instantiate(mod, { env: { counter: globalObj } });
    const setCounter = inst.exports.setCounter as (v: number) => void;
    const getCounter = inst.exports.getCounter as () => number;

    setCounter(99);
    expect(getCounter()).toBe(99);
    // Also visible from JS side
    expect(globalObj.value).toBe(99);
  });

  test("exportGlobal: export a module global", async () => {
    const binary = compile(function* () {
      const g = yield* Mod.global(Type.i32, 100, true);
      yield* Mod.exportGlobal("myGlobal", g);
      yield* Mod.exportFunc("incr", function* () {
        yield* g.set(g.get().add(1));
      });
    });
    const mod = await WebAssembly.compile(binary);
    const inst = await WebAssembly.instantiate(mod);
    const myGlobal = inst.exports.myGlobal as WebAssembly.Global;
    const incr = inst.exports.incr as () => void;

    expect(myGlobal.value).toBe(100);
    incr();
    expect(myGlobal.value).toBe(101);
  });

  test("importGlobal + module global: correct index space", async () => {
    // imported global gets index 0, module global gets index 1
    const binary = compile(function* () {
      const imported = yield* Mod.importGlobal("env", "base", Type.i32, false);
      const counter = yield* Mod.global(Type.i32, 0, true);
      yield* Mod.exportFunc("add", { v: Type.i32 }, function* (v) {
        yield* counter.set(counter.get().add(imported.get()).add(v));
        return yield* counter.get();
      });
    });
    const baseGlobal = new WebAssembly.Global({ value: "i32", mutable: false }, 10);
    const mod = await WebAssembly.compile(binary);
    const inst = await WebAssembly.instantiate(mod, { env: { base: baseGlobal } });
    const add = inst.exports.add as (v: number) => number;

    // counter = 0 + 10 + 5 = 15
    expect(add(5)).toBe(15);
    // counter = 15 + 10 + 3 = 28
    expect(add(3)).toBe(28);
  });
});
