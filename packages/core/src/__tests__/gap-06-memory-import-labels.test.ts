import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Op, Mem, Ctrl } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { set } from "../dsl/expr";
import { instantiate } from "../runtime/instantiate";

// === W-13: Memory Import ===

describe("W-13: Memory Import", () => {
  test("import memory from host and use it", async () => {
    const binary = compile(function* () {
      yield* Mod.importMemory("env", "memory", { min: 1 });
      yield* Mod.exportFunc("load", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load(addr);
      });
      yield* Mod.exportFunc("store", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });

    const memory = new WebAssembly.Memory({ initial: 1 });
    const view = new Int32Array(memory.buffer);
    view[0] = 42;

    const module = new WebAssembly.Module(binary);
    const instance = new WebAssembly.Instance(module, { env: { memory } });
    const { load, store } = instance.exports as { load: Function; store: Function };
    expect(load(0)).toBe(42);
    store(4, 99);
    expect(view[1]).toBe(99);
  });

  test("mutual exclusion: importMemory + memory throws", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.importMemory("env", "memory", { min: 1 });
        yield* Mod.memory(2);
        yield* Mod.exportFunc("noop", function* () {});
      });
    }).toThrow("Cannot declare memory: memory is already imported");
  });

  test("mutual exclusion: memory + importMemory throws", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(2);
        yield* Mod.importMemory("env", "memory", { min: 1 });
        yield* Mod.exportFunc("noop", function* () {});
      });
    }).toThrow("Cannot import memory: memory is already declared");
  });

  test("import memory with max", async () => {
    const binary = compile(function* () {
      yield* Mod.importMemory("env", "memory", { min: 1, max: 4 });
      yield* Mod.exportFunc("load", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load(addr);
      });
    });

    const memory = new WebAssembly.Memory({ initial: 1, maximum: 4 });
    const module = new WebAssembly.Module(binary);
    const instance = new WebAssembly.Instance(module, { env: { memory } });
    const { load } = instance.exports as { load: Function };
    expect(load(0)).toBe(0);
  });
});

// === D-02: Named Labels ===

describe("D-02: Named Labels", () => {
  test("block with label, br by label", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.block("outer", function* () {
          yield* set(result, 1);
          yield* Ctrl.br("outer"); // break out of block
          yield* set(result, 2); // should NOT execute
        });
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1);
  });

  test("nested block/loop with labels", async () => {
    // Sum 1..5 using named labels
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const i = yield* local(Type.i32, 0);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.block("done", function* () {
          yield* Ctrl.loop("again", function* () {
            yield* i.incrBy(1);
            yield* sum.incrBy(i);
            yield* Ctrl.br_if("done", i.ge(5)); // break when i >= 5
            yield* Ctrl.br("again"); // continue loop
          });
        });
        return sum;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(15); // 1+2+3+4+5
  });

  test("numeric depth still works (backward compatible)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.block(function* () {
          yield* set(result, 42);
          yield* Ctrl.br(0); // numeric depth
          yield* set(result, 99);
        });
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42);
  });

  test("unknown label throws", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Ctrl.block("outer", function* () {
            yield* Ctrl.br("nonexistent");
          });
        });
      });
    }).toThrow("Unknown label 'nonexistent' in br");
  });

  test("br_if with label", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", { x: Type.i32 }, function* (x) {
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.block("exit", function* () {
          yield* Ctrl.br_if("exit", x.gt(10));
          yield* set(result, 1); // only executes if x <= 10
        });
        return result;
      });
    });
    const { exports: { test: fn } } = await instantiate(binary);
    expect((fn as Function)(5)).toBe(1);   // x <= 10, set result = 1
    expect((fn as Function)(20)).toBe(0);  // x > 10, skip set
  });
});

// === W-15: f32/f64 Complete Arithmetic DSL ===

describe("W-15: f32/f64 Complete Arithmetic", () => {
  test("Op.f64.copysign", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* Op.f64.copysign(a, b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const fn = run as (a: number, b: number) => number;
    expect(fn(5.0, -1.0)).toBe(-5.0);  // copy negative sign
    expect(fn(-5.0, 1.0)).toBe(5.0);   // copy positive sign
    expect(fn(3.0, 3.0)).toBe(3.0);    // same sign
  });

  test("Op.f32.copysign", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { a: Type.f32, b: Type.f32 }, function* (a, b) {
        return yield* Op.f32.copysign(a, b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const fn = run as (a: number, b: number) => number;
    expect(fn(5.0, -1.0)).toBeCloseTo(-5.0);
    expect(fn(-5.0, 1.0)).toBeCloseTo(5.0);
  });

  test("Op.f64.min and Op.f64.max (IEEE 754)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("fmin", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* Op.f64.min(a, b);
      });
      yield* Mod.exportFunc("fmax", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        return yield* Op.f64.max(a, b);
      });
    });
    const { exports } = await instantiate(binary);
    const fmin = exports.fmin as (a: number, b: number) => number;
    const fmax = exports.fmax as (a: number, b: number) => number;
    expect(fmin(3.0, 5.0)).toBe(3.0);
    expect(fmax(3.0, 5.0)).toBe(5.0);
    expect(fmin(-1.0, 1.0)).toBe(-1.0);
    // NaN propagation: min/max with NaN returns NaN
    expect(fmin(NaN, 1.0)).toBeNaN();
    expect(fmax(1.0, NaN)).toBeNaN();
  });

  test("Op.f32.min and Op.f32.max", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("fmin", { a: Type.f32, b: Type.f32 }, function* (a, b) {
        return yield* Op.f32.min(a, b);
      });
      yield* Mod.exportFunc("fmax", { a: Type.f32, b: Type.f32 }, function* (a, b) {
        return yield* Op.f32.max(a, b);
      });
    });
    const { exports } = await instantiate(binary);
    const fmin = exports.fmin as (a: number, b: number) => number;
    const fmax = exports.fmax as (a: number, b: number) => number;
    expect(fmin(3.0, 5.0)).toBeCloseTo(3.0);
    expect(fmax(3.0, 5.0)).toBeCloseTo(5.0);
  });

  test("ChainableExpr.copysign method", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { a: Type.f64, b: Type.f64 }, function* (a, b) {
        // Use chain method: a.copysign(b)
        return yield* a.copysign(b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const fn = run as (a: number, b: number) => number;
    expect(fn(10.0, -1.0)).toBe(-10.0);
    expect(fn(-10.0, 1.0)).toBe(10.0);
  });
});

// === V-13: Static Constant Address Bounds Check ===

describe("V-13: Static Constant Address Bounds Check", () => {
  test("constant address out of bounds throws", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1); // 1 page = 65536 bytes
        yield* Mod.exportFunc("run", function* () {
          // Load from address 65536 (exactly 1 page), which exceeds bounds
          return yield* Mem.load(65536);
        });
      });
    }).toThrow(/Static memory access out of bounds/);
  });

  test("constant address within bounds succeeds", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        // Load from address 65532 (last valid i32 in page 1)
        return yield* Mem.load(65532);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0);
  });

  test("dynamic address skips validation", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load(addr);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)(0)).toBe(0);
  });

  test("constant store out of bounds throws", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Mem.store(65536, 42);
        });
      });
    }).toThrow(/Static memory access out of bounds/);
  });

  test("i32Array constant access out of bounds", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const arr = Mem.i32Array(0);
          // idx 16384 → addr 65536 → out of bounds for 1 page
          return yield* arr.load(16384);
        });
      });
    }).toThrow(/Static memory access out of bounds/);
  });

  test("byte store at boundary", () => {
    // store8 at 65536 should fail (1 byte access at boundary)
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Mem.store8(65536, 1);
        });
      });
    }).toThrow(/Static memory access out of bounds/);
  });

  test("byte store at last valid address succeeds", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        yield* Mem.store8(65535, 1); // last valid byte
        return yield* Mem.load8(65535);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1);
  });

  test("2 pages allows higher addresses", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(2); // 2 pages = 131072 bytes
      yield* Mod.exportFunc("run", function* () {
        yield* Mem.store(65536, 123);
        return yield* Mem.load(65536);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(123);
  });
});
