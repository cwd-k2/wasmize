import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Mod } from "../primitives";
import { BumpAllocator } from "../allocator";
import { boundsCheckedArray } from "../bounds";
import { instantiate } from "../../test-helpers";

describe("Bounds checking", () => {
  test("valid access succeeds", async () => {
    const alloc = new BumpAllocator();
    const arr = boundsCheckedArray(alloc, 4);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", function* () {
        yield* arr.store(0, 42);
        yield* arr.store(3, 99);
        return yield* arr.load(3);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(99);
  });

  test("out-of-bounds load triggers trap", async () => {
    const alloc = new BumpAllocator();
    const arr = boundsCheckedArray(alloc, 4);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", { idx: "i32" as const }, function* (idx) {
        return yield* arr.load(idx);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    // Valid access
    expect((run as Function)(0)).toBe(0);
    // Out-of-bounds should trap
    await expect(async () => (run as Function)(4)).rejects.toThrow();
    await expect(async () => (run as Function)(-1)).rejects.toThrow();
  });

  test("out-of-bounds store triggers trap", async () => {
    const alloc = new BumpAllocator();
    const arr = boundsCheckedArray(alloc, 2);

    const binary = compile(function* () {
      yield* Mod.memory(alloc.requiredPages);
      yield* Mod.exportFunc("run", { idx: "i32" as const }, function* (idx) {
        yield* arr.store(idx, 42);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    // Valid
    expect(() => (run as Function)(0)).not.toThrow();
    expect(() => (run as Function)(1)).not.toThrow();
    // Out-of-bounds
    expect(() => (run as Function)(2)).toThrow();
  });
});
