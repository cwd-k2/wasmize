import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { param, local, Type, Mod, Mem } from "../primitives";
import { instantiate } from "../../test-helpers";
import { withBoundsCheck } from "../guard";
// Note: withBoundsCheck uses interceptIR which only transforms stmt instructions.
// Loads in return expressions must be captured via local variables to be guarded.

describe("withBoundsCheck", () => {
  test("allows valid memory access", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        return yield* withBoundsCheck(
          (function* () {
            const addr = yield* param(Type.i32);
            yield* Mem.store(addr, Mem.i32(42));
            return yield* Mem.load(addr);
          })(),
          65536, // 1 page
        );
      });
      yield* Mod.export("test", fn);
    });

    const {
      exports: { test: testFn },
    } = await instantiate(binary);
    expect((testFn as Function)(0)).toBe(42);
    expect((testFn as Function)(100)).toBe(42);
  });

  test("traps on out-of-bounds store", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        yield* withBoundsCheck(
          (function* () {
            const addr = yield* param(Type.i32);
            yield* Mem.store(addr, Mem.i32(99));
          })(),
          256, // Guard at 256 bytes
        );
      });
      yield* Mod.export("store", fn);
    });

    const {
      exports: { store },
    } = await instantiate(binary);
    // Valid access within bounds
    expect(() => (store as Function)(0)).not.toThrow();
    // Out-of-bounds access should trap
    expect(() => (store as Function)(256)).toThrow();
    expect(() => (store as Function)(1000)).toThrow();
  });

  test("traps on out-of-bounds load via local", async () => {
    // Loads must be captured in a local_set stmt to be guarded by interceptIR
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        return yield* withBoundsCheck(
          (function* () {
            const addr = yield* param(Type.i32);
            const result = yield* local(Type.i32);
            yield* result.set(yield* Mem.load(addr));
            return result;
          })(),
          256,
        );
      });
      yield* Mod.export("load", fn);
    });

    const {
      exports: { load },
    } = await instantiate(binary);
    // Valid access
    expect((load as Function)(0)).toBe(0);
    // OOB load traps
    expect(() => (load as Function)(256)).toThrow();
  });

  test("without guard, OOB access does not trap within Wasm memory", async () => {
    // Without guard, accessing valid Wasm memory (within page) doesn't trap
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        const addr = yield* param(Type.i32);
        yield* Mem.store(addr, Mem.i32(42));
        return yield* Mem.load(addr);
      });
      yield* Mod.export("test", fn);
    });

    const {
      exports: { test: testFn },
    } = await instantiate(binary);
    // Access at offset 1000 is within Wasm 1-page memory (65536 bytes)
    expect((testFn as Function)(1000)).toBe(42);
  });
});
