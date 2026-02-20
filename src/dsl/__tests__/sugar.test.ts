import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { param, local, Type, Mod, Op, Mem, Ctrl, Loc } from "../primitives";
import { instantiate } from "../../runtime/instantiate";

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
    const {
      exports: { sel },
    } = await instantiate(binary);
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
    const {
      exports: { max },
    } = await instantiate(binary);
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
    const {
      exports: { min },
    } = await instantiate(binary);
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
    const {
      exports: { store2d, load2d },
    } = await instantiate(binary);
    const s = store2d as Function;
    const l = load2d as Function;

    // Store into a 3x3 matrix
    s(0, 0, 1);
    s(0, 1, 2);
    s(0, 2, 3);
    s(1, 0, 4);
    s(1, 1, 5);
    s(1, 2, 6);
    s(2, 0, 7);
    s(2, 1, 8);
    s(2, 2, 9);

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
    const {
      exports: { store2d, load2d },
    } = await instantiate(binary);
    (store2d as Function)(0, 0, 42);
    (store2d as Function)(1, 1, 99);
    expect((load2d as Function)(0, 0)).toBe(42);
    expect((load2d as Function)(1, 1)).toBe(99);
  });
});

describe("Ctrl.switch", () => {
  test("dispatches to correct case (dense br_table)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        const dir = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.switch(dir)
          .case(0, function* () {
            yield* result.set(10);
          })
          .case(1, function* () {
            yield* result.set(20);
          })
          .case(2, function* () {
            yield* result.set(30);
          })
          .case(3, function* () {
            yield* result.set(40);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("dispatch", fn);
    });
    const {
      exports: { dispatch },
    } = await instantiate(binary);
    const d = dispatch as Function;
    expect(d(0)).toBe(10);
    expect(d(1)).toBe(20);
    expect(d(2)).toBe(30);
    expect(d(3)).toBe(40);
  });

  test("dense cases with default", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.switch(x)
          .case(10, function* () {
            yield* result.set(100);
          })
          .case(11, function* () {
            yield* result.set(110);
          })
          .case(12, function* () {
            yield* result.set(120);
          })
          .default(function* () {
            yield* result.set(-1);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("sw", fn);
    });
    const {
      exports: { sw },
    } = await instantiate(binary);
    const f = sw as Function;
    expect(f(10)).toBe(100);
    expect(f(11)).toBe(110);
    expect(f(12)).toBe(120);
    expect(f(9)).toBe(-1);
    expect(f(13)).toBe(-1);
  });

  test("dense non-zero-based without default", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.switch(x)
          .case(5, function* () {
            yield* result.set(50);
          })
          .case(6, function* () {
            yield* result.set(60);
          })
          .case(7, function* () {
            yield* result.set(70);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("sw", fn);
    });
    const {
      exports: { sw },
    } = await instantiate(binary);
    const f = sw as Function;
    expect(f(5)).toBe(50);
    expect(f(6)).toBe(60);
    expect(f(7)).toBe(70);
    expect(f(4)).toBe(0); // no default, result stays 0
  });

  test("sparse cases fall through to default", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, -1);
        yield* Ctrl.switch(x)
          .case(1, function* () {
            yield* result.set(100);
          })
          .case(2, function* () {
            yield* result.set(200);
          })
          .default(function* () {
            yield* result.set(999);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("sw", fn);
    });
    const {
      exports: { sw },
    } = await instantiate(binary);
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
    const {
      exports: { swap, load },
      mem,
    } = await instantiate(binary);
    mem![0] = 10;
    mem![1] = 20;
    mem![2] = 30;

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

// --- New sugar tests ---

describe("array notation", () => {
  test("Ctrl.for with array body", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const arr = Mem.i32Array();
      const fn = yield* Mod.func(function* () {
        const n = yield* param(Type.i32);
        const i = yield* local(Type.i32);
        yield* Ctrl.for(i, 0, i.lt(n), i.add(1), () => [arr.store(i, i.mul(i))]);
        return yield* arr.load(n.sub(1));
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(5)).toBe(16); // 4*4
  });

  test("Ctrl.when with array body", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.when(x.gt(0), () => [result.set(42)]);
        return yield* Loc.get(result);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(1)).toBe(42);
    expect((run as Function)(0)).toBe(0);
  });

  test("Ctrl.while with array body", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const n = yield* param(Type.i32);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.while(n.gt(0), () => [sum.set(sum.add(n)), n.set(n.sub(1))]);
        return yield* Loc.get(sum);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(5)).toBe(15); // 5+4+3+2+1
  });

  test("Ctrl.switch with array bodies", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const dir = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.switch(dir)
          .case(0, () => [result.set(10)])
          .case(1, () => [result.set(20)])
          .default(() => [result.set(99)]);
        return yield* Loc.get(result);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(0)).toBe(10);
    expect((run as Function)(1)).toBe(20);
    expect((run as Function)(5)).toBe(99);
  });

  test("array body with ThenBuilder (Ctrl.if inside array)", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const a = yield* local(Type.i32, 0);
        const b = yield* local(Type.i32, 0);
        yield* Ctrl.while(x.gt(0), () => [
          a.set(a.add(1)),
          Ctrl.if(x.gt(5))
            .then(function* () {
              yield* b.set(b.add(10));
            })
            .else(function* () {
              yield* b.set(b.add(1));
            }),
          x.set(x.sub(1)),
        ]);
        return yield* a.add(b);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    // x=10: a=10, b = 5*10 + 5*1 = 55
    expect((run as Function)(10)).toBe(65);
  });
});

describe("inline params", () => {
  test("Mod.func with param record", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      yield* Mod.export("add", fn);
    });
    const {
      exports: { add },
    } = await instantiate(binary);
    expect((add as Function)(3, 4)).toBe(7);
  });

  test("rejects numeric keys", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.func({ "0": Type.i32 } as Record<string, "i32">, function* (a) {
          return yield* Loc.get(a);
        });
      });
    }).toThrow(/Numeric key/);
  });
});

describe("Mod.exportFunc", () => {
  test("basic exportFunc", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("double", function* () {
        const x = yield* param(Type.i32);
        return yield* x.mul(2);
      });
    });
    const {
      exports: { double: dbl },
    } = await instantiate(binary);
    expect((dbl as Function)(21)).toBe(42);
  });

  test("exportFunc with inline params", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("mul", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.mul(b);
      });
    });
    const {
      exports: { mul },
    } = await instantiate(binary);
    expect((mul as Function)(6, 7)).toBe(42);
  });

  test("exportFunc returns callable ref", async () => {
    const binary = compile(function* () {
      const add = yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      // Use the returned ref in another function
      yield* Mod.exportFunc("add3", { x: Type.i32 }, function* (x) {
        return yield* add(x, 3);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.add as Function)(2, 3)).toBe(5);
    expect((exports.add3 as Function)(10)).toBe(13);
  });
});

describe("Mod.recursive", () => {
  test("factorial via self-recursion", async () => {
    const binary = compile(function* () {
      const fact = yield* Mod.recursive(function* (self) {
        const n = yield* param(Type.i32);
        return yield* Ctrl.if(n.le(1))
          .then(function* () {
            return yield* Mem.i32(1);
          })
          .else(function* () {
            return yield* n.mul(self(n.sub(1)));
          });
      });
      yield* Mod.export("fact", fact);
    });
    const {
      exports: { fact },
    } = await instantiate(binary);
    expect((fact as Function)(0)).toBe(1);
    expect((fact as Function)(1)).toBe(1);
    expect((fact as Function)(5)).toBe(120);
    expect((fact as Function)(10)).toBe(3628800);
  });

  test("recursive with inline params", async () => {
    const binary = compile(function* () {
      const fib = yield* Mod.recursive({ n: Type.i32 }, function* (self, n) {
        return yield* Ctrl.if(n.le(1))
          .then(function* () {
            return yield* Loc.get(n);
          })
          .else(function* () {
            return yield* Op.add(self(n.sub(1)), self(n.sub(2)));
          });
      });
      yield* Mod.export("fib", fib);
    });
    const {
      exports: { fib },
    } = await instantiate(binary);
    expect((fib as Function)(0)).toBe(0);
    expect((fib as Function)(1)).toBe(1);
    expect((fib as Function)(10)).toBe(55);
  });
});

describe("Ctrl.range", () => {
  test("3-arg form: range(i, n, body) counts from 0", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const arr = Mem.i32Array();
      const fn = yield* Mod.func(function* () {
        const n = yield* param(Type.i32);
        const i = yield* local(Type.i32);
        // fill arr[0..n) with i*i
        yield* Ctrl.range(i, n, () => [arr.store(i, i.mul(i))]);
        return yield* arr.load(n.sub(1));
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(5)).toBe(16); // 4*4
  });

  test("4-arg form: range(i, start, end, body)", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const start = yield* param(Type.i32);
        const end = yield* param(Type.i32);
        const i = yield* local(Type.i32);
        const sum = yield* local(Type.i32, 0);
        yield* Ctrl.range(i, start, end, () => [sum.set(sum.add(i))]);
        return yield* Loc.get(sum);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    // sum of 3..7 = 3+4+5+6 = 18
    expect((run as Function)(3, 7)).toBe(18);
  });
});

describe("i32Array.at()", () => {
  test("at() read and write", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const arr = Mem.i32Array();
      const fn = yield* Mod.func(function* () {
        const idx = yield* param(Type.i32);
        yield* arr.at(0).set(100);
        yield* arr.at(1).set(200);
        yield* arr.at(2).set(300);
        return yield* arr.at(idx);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(0)).toBe(100);
    expect((run as Function)(1)).toBe(200);
    expect((run as Function)(2)).toBe(300);
  });

  test("at().incrBy() mutation", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const arr = Mem.i32Array();
      const fn = yield* Mod.func(function* () {
        yield* arr.at(0).set(10);
        yield* arr.at(0).incrBy(5);
        return yield* arr.load(0);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)()).toBe(15);
  });
});

describe("Ctrl.if().elseif() chaining", () => {
  test("basic 2-branch elseif (no final else)", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.if(x.eq(1))
          .then(function* () {
            yield* result.set(10);
          })
          .elseif(x.eq(2))
          .then(function* () {
            yield* result.set(20);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(1)).toBe(10);
    expect((run as Function)(2)).toBe(20);
    expect((run as Function)(3)).toBe(0); // no match, stays 0
  });

  test("3-branch with final else", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.if(x.eq(1))
          .then(function* () {
            yield* result.set(10);
          })
          .elseif(x.eq(2))
          .then(function* () {
            yield* result.set(20);
          })
          .else(function* () {
            yield* result.set(99);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(1)).toBe(10);
    expect((run as Function)(2)).toBe(20);
    expect((run as Function)(0)).toBe(99);
  });

  test("multiple elseif chain (4 branches)", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.if(x.eq(1))
          .then(function* () {
            yield* result.set(10);
          })
          .elseif(x.eq(2))
          .then(function* () {
            yield* result.set(20);
          })
          .elseif(x.eq(3))
          .then(function* () {
            yield* result.set(30);
          })
          .elseif(x.eq(4))
          .then(function* () {
            yield* result.set(40);
          })
          .else(function* () {
            yield* result.set(-1);
          });
        return yield* Loc.get(result);
      });
      yield* Mod.export("run", fn);
    });
    const {
      exports: { run },
    } = await instantiate(binary);
    expect((run as Function)(1)).toBe(10);
    expect((run as Function)(2)).toBe(20);
    expect((run as Function)(3)).toBe(30);
    expect((run as Function)(4)).toBe(40);
    expect((run as Function)(5)).toBe(-1);
  });

  test("elseif with return values (if-expression)", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* param(Type.i32);
        return yield* Ctrl.if(x.lt(0))
          .then(function* () {
            return yield* Mem.i32(-1);
          })
          .elseif(x.eq(0))
          .then(function* () {
            return yield* Mem.i32(0);
          })
          .else(function* () {
            return yield* Mem.i32(1);
          });
      });
      yield* Mod.export("sign", fn);
    });
    const {
      exports: { sign },
    } = await instantiate(binary);
    expect((sign as Function)(-5)).toBe(-1);
    expect((sign as Function)(0)).toBe(0);
    expect((sign as Function)(7)).toBe(1);
  });
});

describe("Mod.global", () => {
  test("mutable global as counter", async () => {
    const binary = compile(function* () {
      const counter = yield* Mod.global(Type.i32, 0);
      yield* Mod.exportFunc("inc", function* () {
        yield* counter.set(counter.get().add(1));
        return yield* counter.get();
      });
      yield* Mod.exportFunc("get", function* () {
        return yield* counter.get();
      });
    });
    const { exports } = await instantiate(binary);
    const inc = exports.inc as Function;
    const get = exports.get as Function;
    expect(get()).toBe(0);
    expect(inc()).toBe(1);
    expect(inc()).toBe(2);
    expect(inc()).toBe(3);
    expect(get()).toBe(3);
  });

  test("immutable global constant", async () => {
    const binary = compile(function* () {
      const BASE = yield* Mod.global(Type.i32, 42, false);
      yield* Mod.exportFunc("getBase", function* () {
        return yield* BASE.get();
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.getBase as Function)()).toBe(42);
  });

  test("global with non-zero init", async () => {
    const binary = compile(function* () {
      const g = yield* Mod.global(Type.i32, 100);
      yield* Mod.exportFunc("dec", function* () {
        const v = yield* param(Type.i32);
        yield* g.set(g.get().sub(v));
        return yield* g.get();
      });
    });
    const { exports } = await instantiate(binary);
    const dec = exports.dec as Function;
    expect(dec(10)).toBe(90);
    expect(dec(40)).toBe(50);
  });
});
