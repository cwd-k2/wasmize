import { describe, test, expect } from "vitest";
import { compile, compileWithDiagnostics } from "../dsl/compiler";
import { Mod, Ctrl, Mem } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";
import { gcd, lcm, gcdI64, memcpy, memset } from "../stdlib";
import { isPowerOf2, log2Floor, nextPowerOf2Func, bswap32 } from "../stdlib/bits";
import { IR } from "../wasm/ir";

// === D-07: Mod.useAll ===

describe("D-07: Mod.useAll", () => {
  test("multiple stdlib functions used at once", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const { memcpy: cpy, memset: mset } = yield* Mod.useAll({ memcpy, memset });
      yield* Mod.exportFunc("run", function* () {
        // memset 4 bytes at offset 0 to value 42
        yield* mset.void(0, 42, 4);
        // memcpy those 4 bytes to offset 100
        yield* cpy.void(100, 0, 4);
        // Read byte at offset 100
        return yield* Mem.load8(100);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42);
  });

  test("useAll returns callable functions", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const { gcd: gcdFn } = yield* Mod.useAll({ gcd });
      yield* Mod.exportFunc("run", { a: "i32" as const, b: "i32" as const }, function* (a, b) {
        return yield* gcdFn(a, b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)(12, 8)).toBe(4);
  });
});

// === S-02: GCD / LCM ===

describe("S-02: GCD / LCM", () => {
  test("gcd basic cases", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.use(gcd);
      yield* Mod.exportFunc("run", { a: "i32" as const, b: "i32" as const }, function* (a, b) {
        return yield* fn(a, b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const g = run as Function;
    expect(g(12, 8)).toBe(4);
    expect(g(0, 5)).toBe(5);
    expect(g(5, 0)).toBe(5);
    expect(g(0, 0)).toBe(0);
    expect(g(7, 13)).toBe(1);
    expect(g(100, 75)).toBe(25);
  });

  test("lcm basic cases", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.use(lcm);
      yield* Mod.exportFunc("run", { a: "i32" as const, b: "i32" as const }, function* (a, b) {
        return yield* fn(a, b);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const l = run as Function;
    expect(l(4, 6)).toBe(12);
    expect(l(0, 5)).toBe(0);
    expect(l(3, 7)).toBe(21);
    expect(l(12, 8)).toBe(24);
  });

  test("gcdI64 basic cases", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.use(gcdI64);
      yield* Mod.exportFunc("run", { a: "i64" as const, b: "i64" as const }, function* (a, b) {
        // Store in i64 local to preserve type through inferType
        const result = yield* local(Type.i64, fn(a, b));
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const g = run as Function;
    expect(g(12n, 8n)).toBe(4n);
    expect(g(0n, 5n)).toBe(5n);
    expect(g(100n, 75n)).toBe(25n);
  });
});

// === S-09: Bit Manipulation Utilities ===

describe("S-09: Bit Manipulation Utilities", () => {
  test("isPowerOf2", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { n: "i32" as const }, function* (n) {
        return yield* isPowerOf2(n);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as Function;
    expect(f(0)).toBe(0); // 0 is not a power of 2
    expect(f(1)).toBe(1);
    expect(f(2)).toBe(1);
    expect(f(3)).toBe(0);
    expect(f(4)).toBe(1);
    expect(f(16)).toBe(1);
    expect(f(17)).toBe(0);
  });

  test("log2Floor", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { n: "i32" as const }, function* (n) {
        return yield* log2Floor(n);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as Function;
    expect(f(1)).toBe(0);
    expect(f(2)).toBe(1);
    expect(f(4)).toBe(2);
    expect(f(8)).toBe(3);
    expect(f(15)).toBe(3);
    expect(f(16)).toBe(4);
  });

  test("nextPowerOf2Func", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.use(nextPowerOf2Func);
      yield* Mod.exportFunc("run", { n: "i32" as const }, function* (n) {
        return yield* fn(n);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as Function;
    expect(f(1)).toBe(1);
    expect(f(2)).toBe(2);
    expect(f(3)).toBe(4);
    expect(f(5)).toBe(8);
    expect(f(7)).toBe(8);
    expect(f(9)).toBe(16);
    expect(f(16)).toBe(16);
    expect(f(17)).toBe(32);
  });

  test("bswap32", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", { n: "i32" as const }, function* (n) {
        return yield* bswap32(n);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as Function;
    expect(f(0x01020304) >>> 0).toBe(0x04030201 >>> 0);
    expect(f(0xFF000000) >>> 0).toBe(0x000000FF >>> 0);
    expect(f(0x00FF0000) >>> 0).toBe(0x0000FF00 >>> 0);
  });
});

// === V-05: br depth validation ===

describe("V-05: br depth validation", () => {
  test("br depth exceeding nesting level throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          // br(0) at top level (nesting = 0) is invalid
          yield { _type: "stmt" as const, node: IR.br(0) };
        });
      }),
    ).toThrow("br depth 0 exceeds block nesting level 0");
  });

  test("br depth within nesting level succeeds", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        // block { br(0) } — valid (nesting = 1, depth = 0)
        yield* Ctrl.block(function* () {
          yield { _type: "stmt" as const, node: IR.br(0) };
        });
        return 42;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42);
  });

  test("br_if depth exceeding nesting throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield { _type: "stmt" as const, node: IR.br_if(1, IR.const_i32(1)) };
        });
      }),
    ).toThrow("br depth 1 exceeds block nesting level 0");
  });
});

// === V-06: Local variable index validation ===

describe("V-06: Local variable index validation", () => {
  test("local_get with out-of-range index throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield { _type: "stmt" as const, node: IR.local_set(999, IR.const_i32(0)) };
        });
      }),
    ).toThrow("Local index 999 out of range (0 locals declared)");
  });

  test("valid local index succeeds", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const x = yield* local(Type.i32, 42);
        return x;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42);
  });
});

// === V-07: Data Segment overlap/boundary ===

describe("V-07: Data Segment overlap detection", () => {
  test("overlapping data segments emit warning via diagnostics", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([1, 2, 3, 4])); // [0, 4)
      yield* Mod.data(2, new Uint8Array([5, 6, 7, 8])); // [2, 6) — overlaps
      yield* Mod.exportFunc("noop", function* () {
        return 0;
      });
    });

    const warning = result.diagnostics.find(
      (d) => d.code === "V-07" && d.level === "warning",
    );
    expect(warning).toBeDefined();
    expect(warning!.message).toContain("overlap");
  });

  test("non-overlapping data segments produce no warning", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([1, 2, 3, 4]));   // [0, 4)
      yield* Mod.data(100, new Uint8Array([5, 6, 7, 8])); // [100, 104)
      yield* Mod.exportFunc("noop", function* () {
        return 0;
      });
    });

    const warning = result.diagnostics.find((d) => d.code === "V-07");
    expect(warning).toBeUndefined();
  });

  test("overlap warning promoted to error in strict mode", () => {
    const result = compileWithDiagnostics(
      function* () {
        yield* Mod.memory(1);
        yield* Mod.data(0, new Uint8Array([1, 2, 3, 4]));
        yield* Mod.data(2, new Uint8Array([5, 6, 7, 8]));
        yield* Mod.exportFunc("noop", function* () {
          return 0;
        });
      },
      { strict: true },
    );

    const err = result.diagnostics.find((d) => d.code === "V-07" && d.level === "error");
    expect(err).toBeDefined();
    expect(result.binary).toBeUndefined();
  });
});
