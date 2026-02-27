import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Ctrl, Mem } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { set } from "../dsl/expr";
import { instantiate } from "../runtime/instantiate";
import { MaxHeap } from "../dsl/maxheap";
import { UnionFind } from "../dsl/union-find";
import { BumpAllocator, checkRegionOverlaps } from "../dsl/allocator";

// === S-22: MaxHeap ===

describe("S-22: MaxHeap", () => {
  test("insert and extractMax in descending order", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const heap = yield* MaxHeap(0);
        const dstPri = yield* local(Type.i32);
        const dstVal = yield* local(Type.i32);
        const result = yield* local(Type.i32, 0);

        // Insert priorities: 3, 1, 4, 1, 5
        yield* heap.insert(3, 30);
        yield* heap.insert(1, 10);
        yield* heap.insert(4, 40);
        yield* heap.insert(1, 11);
        yield* heap.insert(5, 50);

        // Extract max: should get 5, 4, 3, 1, 1
        yield* heap.extractMax(dstPri, dstVal);
        yield* result.incrBy(dstPri); // +5
        yield* heap.extractMax(dstPri, dstVal);
        yield* result.mulBy(10);
        yield* result.incrBy(dstPri); // *10+4 = 54
        yield* heap.extractMax(dstPri, dstVal);
        yield* result.mulBy(10);
        yield* result.incrBy(dstPri); // *10+3 = 543

        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(543);
  });

  test("peekPriority and peekValue", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const heap = yield* MaxHeap(0);
        yield* heap.insert(10, 100);
        yield* heap.insert(20, 200);
        // Peek should show max (20, 200)
        return yield* heap.peekPriority().add(heap.peekValue());
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(220);
  });

  test("notEmpty and reset", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const heap = yield* MaxHeap(0);
        const r = yield* local(Type.i32, 0);

        // Empty heap: notEmpty should be 0
        yield* Ctrl.when(heap.notEmpty, () => [r.incrBy(100)]);

        yield* heap.insert(1, 1);
        // Non-empty: notEmpty should be 1
        yield* Ctrl.when(heap.notEmpty, () => [r.incrBy(1)]);

        yield* heap.reset();
        // After reset: notEmpty should be 0
        yield* Ctrl.when(heap.notEmpty, () => [r.incrBy(100)]);

        return r;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1);
  });
});

// === S-23: Union-Find ===

describe("S-23: Union-Find", () => {
  test("init, find, union", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      // Base 0, capacity 16
      yield* Mod.exportFunc("run", function* () {
        const uf = yield* UnionFind(0, 16);
        const dst = yield* local(Type.i32);

        yield* uf.init(8);

        // Initially: every element is its own root
        yield* uf.find(0, dst);
        const r = yield* local(Type.i32);
        yield* set(r, dst); // should be 0

        // Union 0 and 1
        yield* uf.union(0, 1);
        // Find 1 should now return same root as 0
        yield* uf.find(1, dst);
        yield* r.mulBy(10);
        yield* r.incrBy(dst); // should be 0

        return r;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0);
  });

  test("same returns 1 for elements in same set", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const uf = yield* UnionFind(0, 16);
        yield* uf.init(4);

        const result = yield* local(Type.i32, 0);
        const tmp = yield* local(Type.i32);

        // Before union: 0 and 1 are different
        const before = yield* uf.same(0, 1);
        yield* set(tmp, before);
        yield* result.incrBy(tmp.mul(100));

        // Union 0 and 1
        yield* uf.union(0, 1);

        // After union: 0 and 1 are same
        const after = yield* uf.same(0, 1);
        yield* set(tmp, after);
        yield* result.incrBy(tmp.mul(10));

        // 2 is still separate
        const separate = yield* uf.same(0, 2);
        yield* set(tmp, separate);
        yield* result.incrBy(tmp);

        // Encode: before*100 + after*10 + separate = 010
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(10);
  });

  test("transitive union", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const uf = yield* UnionFind(0, 16);
        yield* uf.init(5);

        const result = yield* local(Type.i32, 0);
        const tmp = yield* local(Type.i32);

        // Union 0-1, 2-3, then 1-3 => 0,1,2,3 all in same set
        yield* uf.union(0, 1);
        yield* uf.union(2, 3);
        yield* uf.union(1, 3);

        const a = yield* uf.same(0, 3); // should be 1
        yield* set(tmp, a);
        yield* result.incrBy(tmp.mul(10));

        const b = yield* uf.same(0, 4); // should be 0
        yield* set(tmp, b);
        yield* result.incrBy(tmp);

        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(10);
  });
});

// === R-01: Memory Growth Support ===

describe("R-01: Memory Growth Support", () => {
  test("refreshViews recreates views after memory.grow", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
      yield* Mod.exportFunc("grow", function* () {
        return yield* Mem.grow(1);
      });
    });
    const inst = await instantiate(binary);
    const write = inst.exports.write as Function;
    const grow = inst.exports.grow as Function;

    // Write a value before growing
    write(0, 42);
    expect(inst.mem![0]).toBe(42);

    // Grow memory
    grow();

    // After grow, existing views may be detached
    // refreshViews should fix this
    inst.refreshViews();

    // Now views should be valid
    expect(inst.mem![0]).toBe(42);
    expect(inst.bytes![0]).toBe(42);

    // Write to new region (beyond original 64KB)
    write(65536, 99);
    inst.refreshViews();
    expect(inst.mem![65536 / 4]).toBe(99);
  });

  test("refreshViews can be called multiple times safely", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });
    const inst = await instantiate(binary);
    const write = inst.exports.write as Function;
    write(0, 123);

    // Call refreshViews multiple times — should always work
    inst.refreshViews();
    expect(inst.mem![0]).toBe(123);
    inst.refreshViews();
    expect(inst.mem![0]).toBe(123);
  });
});

// === V-08: Allocator Region Overlap Detection ===

describe("V-08: Allocator Region Overlap Detection", () => {
  test("detects overlapping manual regions", () => {
    const alloc = new BumpAllocator();
    alloc.registerRegion({ label: "regionA", offset: 0, size: 100 });
    alloc.registerRegion({ label: "regionB", offset: 50, size: 100 });

    const errors = checkRegionOverlaps([alloc]);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain("Memory region overlap");
    expect(errors[0]).toContain("regionA");
    expect(errors[0]).toContain("regionB");
  });

  test("non-overlapping regions pass", () => {
    const alloc = new BumpAllocator();
    alloc.registerRegion({ label: "regionA", offset: 0, size: 50 });
    alloc.registerRegion({ label: "regionB", offset: 50, size: 50 });

    const errors = checkRegionOverlaps([alloc]);
    expect(errors.length).toBe(0);
  });

  test("allocator regions via alloc() don't overlap", () => {
    const alloc = new BumpAllocator();
    alloc.alloc(100, 4, "first");
    alloc.alloc(100, 4, "second");

    const errors = checkRegionOverlaps([alloc]);
    expect(errors.length).toBe(0);
  });

  test("overlap detection across multiple allocators", () => {
    const alloc1 = new BumpAllocator();
    alloc1.registerRegion({ label: "alloc1-region", offset: 0, size: 100 });

    const alloc2 = new BumpAllocator();
    alloc2.registerRegion({ label: "alloc2-region", offset: 50, size: 100 });

    const errors = checkRegionOverlaps([alloc1, alloc2]);
    expect(errors.length).toBe(1);
  });

  test("compile throws on overlapping regions", () => {
    const alloc = new BumpAllocator();
    alloc.registerRegion({ label: "a", offset: 0, size: 100 });
    alloc.registerRegion({ label: "b", offset: 80, size: 100 });

    expect(() =>
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      }, { allocator: alloc }),
    ).toThrow("Memory region overlap");
  });
});

// === V-10: Function Return Type Consistency ===

describe("V-10: Function Return Type Consistency", () => {
  test("matching declared and actual return type passes", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc(
        "add",
        { a: "i32" as const, b: "i32" as const },
        function* (a, b) {
          return yield* a.add(b);
        },
        { results: [Type.i32] },
      );
    });
    const { exports: { add } } = await instantiate(binary);
    expect((add as Function)(1, 2)).toBe(3);
  });

  test("void function with void declaration passes", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "store",
        { addr: "i32" as const, val: "i32" as const },
        function* (addr, val) {
          yield* Mem.store(addr, val);
        },
        { results: [] },
      );
    });
    const { exports: { store } } = await instantiate(binary);
    // Should not throw
    (store as Function)(0, 42);
  });

  test("declared i32 but body returns void throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.func(
          { addr: "i32" as const, val: "i32" as const },
          function* (addr, val) {
            yield* Mem.store(addr, val);
          },
          { results: [Type.i32] },
        );
        yield* Mod.exportFunc("noop", function* () {});
      }),
    ).toThrow("Function return type mismatch: declared i32 but body returns void");
  });

  test("declared void but body returns i32 throws", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.func(
          { a: "i32" as const, b: "i32" as const },
          function* (a, b) {
            return yield* a.add(b);
          },
          { results: [] },
        );
        yield* Mod.exportFunc("noop", function* () {});
      }),
    ).toThrow("Function return type mismatch: declared void but body returns i32");
  });

  test("no declared results skips check", async () => {
    // Without explicit results declaration, no check is performed
    const binary = compile(function* () {
      yield* Mod.exportFunc("add", { a: "i32" as const, b: "i32" as const }, function* (a, b) {
        return yield* a.add(b);
      });
    });
    const { exports: { add } } = await instantiate(binary);
    expect((add as Function)(3, 4)).toBe(7);
  });
});
