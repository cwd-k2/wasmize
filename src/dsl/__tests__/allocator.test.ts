import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Mod, i64, f64 } from "../primitives";
import { BumpAllocator } from "../allocator";
import { instantiate } from "../../test-helpers";

describe("BumpAllocator", () => {
  test("sequential alloc with default alignment", () => {
    const alloc = new BumpAllocator();
    expect(alloc.alloc(4)).toBe(0);
    expect(alloc.alloc(4)).toBe(4);
    expect(alloc.alloc(8)).toBe(8);
    expect(alloc.usedBytes).toBe(16);
  });

  test("alignment padding", () => {
    const alloc = new BumpAllocator();
    alloc.alloc(3, 1); // 3 bytes, no alignment
    expect(alloc.usedBytes).toBe(3);
    const base = alloc.alloc(4, 4); // should pad to offset 4
    expect(base).toBe(4);
    expect(alloc.usedBytes).toBe(8);
  });

  test("8-byte alignment for i64/f64", () => {
    const alloc = new BumpAllocator();
    alloc.alloc(4, 4); // 4 bytes at offset 0
    const base = alloc.alloc(8, 8); // should pad to offset 8
    expect(base).toBe(8);
    expect(alloc.usedBytes).toBe(16);
  });

  test("requiredPages calculation", () => {
    const alloc = new BumpAllocator();
    expect(alloc.requiredPages).toBe(1); // minimum 1 page

    alloc.alloc(65536);
    expect(alloc.requiredPages).toBe(1);

    alloc.alloc(1);
    expect(alloc.requiredPages).toBe(2);
  });

  test("bytes() allocates with 1-byte alignment", () => {
    const alloc = new BumpAllocator();
    expect(alloc.bytes(10)).toBe(0);
    expect(alloc.bytes(5)).toBe(10);
    expect(alloc.usedBytes).toBe(15);
  });

  test("Mod.allocator() creates a BumpAllocator", () => {
    const alloc = Mod.allocator();
    expect(alloc).toBeInstanceOf(BumpAllocator);
  });

  test("i32Array integration", async () => {
    const alloc = Mod.allocator();
    const arr = alloc.i32Array(4);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);

      // Write [10, 20, 30, 40] then read back
      yield* Mod.exportFunc("run", function* () {
        yield* arr.store(0, 10);
        yield* arr.store(1, 20);
        yield* arr.store(2, 30);
        yield* arr.store(3, 40);
        return yield* arr.load(2);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(30);
  });

  test("multiple i32Arrays get non-overlapping regions", async () => {
    const alloc = Mod.allocator();
    const a = alloc.i32Array(2); // 0..7
    const b = alloc.i32Array(2); // 8..15

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", function* () {
        yield* a.store(0, 100);
        yield* b.store(0, 200);
        // a[0] should still be 100, not overwritten
        return yield* a.load(0);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(100);
  });

  test("i64Array integration", async () => {
    const alloc = Mod.allocator();
    const arr = alloc.i64Array(2);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", function* () {
        yield* arr.store(0, i64(42));
        return yield* arr.load(0);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42n);
  });

  test("f64Array integration", async () => {
    const alloc = Mod.allocator();
    const arr = alloc.f64Array(2);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", function* () {
        yield* arr.store(0, f64(3.14));
        return yield* arr.load(0);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBeCloseTo(3.14);
  });

  test("i32Array2D integration", async () => {
    const alloc = Mod.allocator();
    const mat = alloc.i32Array2D(3, 3);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", function* () {
        yield* mat.store(1, 2, 42);
        return yield* mat.load(1, 2);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(42);
  });
});
