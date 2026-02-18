import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { param, local, Type, Mod, Op, Mem, Ctrl, Loc } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("Op.select", () => {
  test("select returns ifTrue when cond is non-zero", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        const c = yield* param(Type.i32);
        return yield* Op.select(c, a, b);
      });
      yield* Mod.export("sel", fn);
    });
    const { exports: { sel } } = await instantiate(binary);
    expect((sel as Function)(10, 20, 1)).toBe(10);
    expect((sel as Function)(10, 20, 0)).toBe(20);
  });
});

describe("Op.max / Op.min", () => {
  test("max returns the greater value", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* Op.max(a, b);
      });
      yield* Mod.export("max", fn);
    });
    const { exports: { max } } = await instantiate(binary);
    expect((max as Function)(3, 7)).toBe(7);
    expect((max as Function)(10, 2)).toBe(10);
    expect((max as Function)(-1, -5)).toBe(-1);
    expect((max as Function)(4, 4)).toBe(4);
  });

  test("min returns the lesser value", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* Op.min(a, b);
      });
      yield* Mod.export("min", fn);
    });
    const { exports: { min } } = await instantiate(binary);
    expect((min as Function)(3, 7)).toBe(3);
    expect((min as Function)(10, 2)).toBe(2);
    expect((min as Function)(-1, -5)).toBe(-5);
  });
});

describe("Mem.i32Array2D", () => {
  test("load/store with 2D indices", async () => {
    const COLS = 3;
    const binary = compile(function* () {
      yield* Mod.memory(1);
      // store(row, col, val)
      const store2d = yield* Mod.func(function* () {
        const row = yield* param(Type.i32);
        const col = yield* param(Type.i32);
        const val = yield* param(Type.i32);
        const mat = Mem.i32Array2D(0, COLS);
        yield* mat.store(row, col, val);
      });
      // load(row, col) -> val
      const load2d = yield* Mod.func(function* () {
        const row = yield* param(Type.i32);
        const col = yield* param(Type.i32);
        const mat = Mem.i32Array2D(0, COLS);
        return yield* mat.load(row, col);
      });
      yield* Mod.export("store2d", store2d);
      yield* Mod.export("load2d", load2d);
    });
    const { exports: { store2d, load2d } } = await instantiate(binary);
    const s = store2d as Function;
    const l = load2d as Function;

    // Store into a 3x3 matrix
    s(0, 0, 1); s(0, 1, 2); s(0, 2, 3);
    s(1, 0, 4); s(1, 1, 5); s(1, 2, 6);
    s(2, 0, 7); s(2, 1, 8); s(2, 2, 9);

    expect(l(0, 0)).toBe(1);
    expect(l(1, 1)).toBe(5);
    expect(l(2, 2)).toBe(9);
    expect(l(1, 0)).toBe(4);
    expect(l(0, 2)).toBe(3);
  });

  test("2D array with non-zero base", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const COLS = 2;
      const BASE = 100; // byte offset
      const store2d = yield* Mod.func(function* () {
        const row = yield* param(Type.i32);
        const col = yield* param(Type.i32);
        const val = yield* param(Type.i32);
        yield* Mem.i32Array2D(BASE, COLS).store(row, col, val);
      });
      const load2d = yield* Mod.func(function* () {
        const row = yield* param(Type.i32);
        const col = yield* param(Type.i32);
        return yield* Mem.i32Array2D(BASE, COLS).load(row, col);
      });
      yield* Mod.export("store2d", store2d);
      yield* Mod.export("load2d", load2d);
    });
    const { exports: { store2d, load2d } } = await instantiate(binary);
    (store2d as Function)(0, 0, 42);
    (store2d as Function)(1, 1, 99);
    expect((load2d as Function)(0, 0)).toBe(42);
    expect((load2d as Function)(1, 1)).toBe(99);
  });
});

describe("Ctrl.switch", () => {
  test("dispatches to correct case", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        const dir = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.switch(dir, [
          [0, function* () { yield* result.set(10); }],
          [1, function* () { yield* result.set(20); }],
          [2, function* () { yield* result.set(30); }],
          [3, function* () { yield* result.set(40); }],
        ]);
        return yield* Loc.get(result);
      });
      yield* Mod.export("dispatch", fn);
    });
    const { exports: { dispatch } } = await instantiate(binary);
    const d = dispatch as Function;
    expect(d(0)).toBe(10);
    expect(d(1)).toBe(20);
    expect(d(2)).toBe(30);
    expect(d(3)).toBe(40);
  });

  test("falls through to default", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, -1);
        yield* Ctrl.switch(
          x,
          [
            [1, function* () { yield* result.set(100); }],
            [2, function* () { yield* result.set(200); }],
          ],
          function* () { yield* result.set(999); },
        );
        return yield* Loc.get(result);
      });
      yield* Mod.export("sw", fn);
    });
    const { exports: { sw } } = await instantiate(binary);
    expect((sw as Function)(1)).toBe(100);
    expect((sw as Function)(2)).toBe(200);
    expect((sw as Function)(99)).toBe(999);
  });
});

describe("i32Array.swap", () => {
  test("swaps two elements", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const arr = Mem.i32Array(0);
      const swap = yield* Mod.func(function* () {
        const i = yield* param(Type.i32);
        const j = yield* param(Type.i32);
        const tmp = yield* local(Type.i32);
        yield* arr.swap(i, j, tmp);
      });
      const load = yield* Mod.func(function* () {
        const idx = yield* param(Type.i32);
        return yield* arr.load(idx);
      });
      yield* Mod.export("swap", swap);
      yield* Mod.export("load", load);
    });
    const { exports: { swap, load }, mem } = await instantiate(binary);
    mem![0] = 10; mem![1] = 20; mem![2] = 30;

    (swap as Function)(0, 2);
    expect((load as Function)(0)).toBe(30);
    expect((load as Function)(1)).toBe(20);
    expect((load as Function)(2)).toBe(10);
  });
});

describe("Mod.exportAll", () => {
  test("exports multiple functions", async () => {
    const binary = compile(function* () {
      const add = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* Op.add(a, b);
      });
      const sub = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* Op.sub(a, b);
      });
      yield* Mod.exportAll({ add, sub });
    });
    const { exports } = await instantiate(binary);
    expect((exports.add as Function)(3, 4)).toBe(7);
    expect((exports.sub as Function)(10, 3)).toBe(7);
  });
});
