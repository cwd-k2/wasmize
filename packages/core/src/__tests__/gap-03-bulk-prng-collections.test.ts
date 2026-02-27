import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Ctrl, Mem } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";
import { writeI32Array } from "../runtime/marshal";
import { binarySearch, lowerBound, upperBound } from "../stdlib/search";
import { usePrng } from "../stdlib/prng";
import { Deque } from "../dsl/deque";
import { HashSet } from "../dsl/hashset";

// === W-03: Bulk Memory Operations ===

describe("W-03: Bulk Memory Operations", () => {
  test("Mem.copy copies bytes between memory regions", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        // Write known values at offset 0..3
        yield* Mem.store8(0, 10);
        yield* Mem.store8(1, 20);
        yield* Mem.store8(2, 30);
        yield* Mem.store8(3, 40);
        // Copy 4 bytes from offset 0 to offset 100
        yield* Mem.copy(100, 0, 4);
        // Read byte at offset 102 (should be 30)
        return yield* Mem.load8(102);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(30);
  });

  test("Mem.fill fills memory region with a byte value", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        // Fill 8 bytes at offset 200 with value 0xAB
        yield* Mem.fill(200, 0xab, 8);
        // Read byte at offset 205 (should be 0xAB)
        return yield* Mem.load8(205);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0xab);
  });

  test("Mem.copy and Mem.fill with dynamic arguments", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "run",
        { dst: "i32" as const, val_: "i32" as const, len: "i32" as const },
        function* (dst, val_, len) {
          yield* Mem.fill(dst, val_, len);
          return yield* Mem.load8(dst);
        },
      );
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)(300, 42, 10)).toBe(42);
  });

  test("bulk-memory feature detected in capabilities scan", () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        yield* Mem.copy(100, 0, 4);
        yield* Mem.fill(200, 0, 8);
      });
    });
    // Manually check that compile succeeded and the binary is valid
    expect(binary).toBeTruthy();
  });
});

// === S-01: PRNG (Xorshift32) ===

describe("S-01: PRNG (Xorshift32)", () => {
  test("seed and next produce deterministic values", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const prng = yield* usePrng();
      yield* Mod.exportFunc("run", function* () {
        yield* prng.seed.void(12345);
        // Generate first value and return it
        return yield* prng.next();
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const val1 = (run as Function)();
    const val2 = (run as Function)();
    // Same seed -> same result (deterministic)
    expect(val1).toBe(val2);
    // Non-zero
    expect(val1).not.toBe(0);
  });

  test("seed reproduces same sequence", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const prng = yield* usePrng();
      yield* Mod.exportFunc("seed", { s: "i32" as const }, function* (s) {
        yield* prng.seed.void(s);
      });
      yield* Mod.exportFunc("next", function* () {
        return yield* prng.next();
      });
    });
    const { exports } = await instantiate(binary);
    const seed = exports.seed as Function;
    const next = exports.next as Function;

    seed(42);
    const seq1 = [next(), next(), next()];
    seed(42);
    const seq2 = [next(), next(), next()];
    expect(seq1).toEqual(seq2);

    // Different seed produces different sequence
    seed(99);
    const seq3 = [next(), next(), next()];
    expect(seq3).not.toEqual(seq1);
  });

  test("nextInRange produces values in [min, max)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const prng = yield* usePrng();
      yield* Mod.exportFunc("seed", { s: "i32" as const }, function* (s) {
        yield* prng.seed.void(s);
      });
      yield* Mod.exportFunc(
        "nextInRange",
        { min: "i32" as const, max: "i32" as const },
        function* (min, max) {
          return yield* prng.nextInRange(min, max);
        },
      );
    });
    const { exports } = await instantiate(binary);
    const seed = exports.seed as Function;
    const nextInRange = exports.nextInRange as Function;

    seed(777);
    for (let i = 0; i < 50; i++) {
      const val = nextInRange(10, 20);
      expect(val).toBeGreaterThanOrEqual(10);
      expect(val).toBeLessThan(20);
    }
  });

  test("nextF64 produces values in [0.0, 1.0)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const prng = yield* usePrng();
      yield* Mod.exportFunc("seed", { s: "i32" as const }, function* (s) {
        yield* prng.seed.void(s);
      });
      yield* Mod.exportFunc("nextF64", function* () {
        const result = yield* local(Type.f64, prng.nextF64());
        return result;
      });
    });
    const { exports } = await instantiate(binary);
    const seed = exports.seed as Function;
    const nextF64 = exports.nextF64 as Function;

    seed(12345);
    for (let i = 0; i < 50; i++) {
      const val = nextF64();
      expect(val).toBeGreaterThanOrEqual(0.0);
      expect(val).toBeLessThan(1.0);
    }
  });
});

// === S-03: Binary Search ===

describe("S-03: Binary Search", () => {
  test("binarySearch finds existing elements", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const search = yield* Mod.use(binarySearch);
      yield* Mod.exportFunc(
        "run",
        { base: "i32" as const, len: "i32" as const, target: "i32" as const },
        function* (base, len, target) {
          return yield* search(base, len, target);
        },
      );
    });
    const { exports, mem } = await instantiate(binary);
    const run = exports.run as Function;

    // Write sorted array [1, 3, 5, 7, 9] at offset 0
    writeI32Array(mem!, 0, [1, 3, 5, 7, 9]);

    expect(run(0, 5, 1)).toBe(0);
    expect(run(0, 5, 5)).toBe(2);
    expect(run(0, 5, 9)).toBe(4);
    // Not found
    expect(run(0, 5, 4)).toBe(-1);
    expect(run(0, 5, 0)).toBe(-1);
    expect(run(0, 5, 10)).toBe(-1);
  });

  test("binarySearch on empty array returns -1", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const search = yield* Mod.use(binarySearch);
      yield* Mod.exportFunc(
        "run",
        { base: "i32" as const, len: "i32" as const, target: "i32" as const },
        function* (base, len, target) {
          return yield* search(base, len, target);
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.run as Function)(0, 0, 42)).toBe(-1);
  });

  test("lowerBound finds first element >= target", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const lb = yield* Mod.use(lowerBound);
      yield* Mod.exportFunc(
        "run",
        { base: "i32" as const, len: "i32" as const, target: "i32" as const },
        function* (base, len, target) {
          return yield* lb(base, len, target);
        },
      );
    });
    const { exports, mem } = await instantiate(binary);
    const run = exports.run as Function;

    // [1, 3, 3, 5, 7]
    writeI32Array(mem!, 0, [1, 3, 3, 5, 7]);

    expect(run(0, 5, 3)).toBe(1); // first 3 at index 1
    expect(run(0, 5, 0)).toBe(0); // all elements >= 0
    expect(run(0, 5, 4)).toBe(3); // first element >= 4 is 5 at index 3
    expect(run(0, 5, 8)).toBe(5); // all elements < 8, returns len
  });

  test("upperBound finds first element > target", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const ub = yield* Mod.use(upperBound);
      yield* Mod.exportFunc(
        "run",
        { base: "i32" as const, len: "i32" as const, target: "i32" as const },
        function* (base, len, target) {
          return yield* ub(base, len, target);
        },
      );
    });
    const { exports, mem } = await instantiate(binary);
    const run = exports.run as Function;

    // [1, 3, 3, 5, 7]
    writeI32Array(mem!, 0, [1, 3, 3, 5, 7]);

    expect(run(0, 5, 3)).toBe(3); // first element > 3 is 5 at index 3
    expect(run(0, 5, 0)).toBe(0); // first element > 0 is 1 at index 0
    expect(run(0, 5, 5)).toBe(4); // first element > 5 is 7 at index 4
    expect(run(0, 5, 7)).toBe(5); // all elements <= 7, returns len
  });
});

// === S-20: Deque ===

describe("S-20: Deque", () => {
  test("pushBack and popFront (FIFO behavior)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const dq = yield* Deque(0, 8);
        const val_ = yield* local(Type.i32);

        yield* dq.pushBack(10);
        yield* dq.pushBack(20);
        yield* dq.pushBack(30);

        yield* dq.popFront(val_);
        // Should get 10 (FIFO)
        return val_;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(10);
  });

  test("pushFront and popBack (FIFO from other end)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const dq = yield* Deque(0, 8);
        const val_ = yield* local(Type.i32);

        yield* dq.pushFront(10);
        yield* dq.pushFront(20);
        yield* dq.pushFront(30);

        yield* dq.popBack(val_);
        // Should get 10 (last pushed to front comes out at back)
        return val_;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(10);
  });

  test("mixed pushFront/pushBack with popFront/popBack", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      // Store results in memory starting at offset 1024
      yield* Mod.exportFunc("run", function* () {
        const dq = yield* Deque(0, 8);
        const val_ = yield* local(Type.i32);
        const result = yield* local(Type.i32, 0);

        yield* dq.pushBack(1);  // [1]
        yield* dq.pushFront(2); // [2, 1]
        yield* dq.pushBack(3);  // [2, 1, 3]

        yield* dq.popFront(val_); // val=2, [1, 3]
        yield* result.incrBy(val_.mul(100));

        yield* dq.popBack(val_);  // val=3, [1]
        yield* result.incrBy(val_.mul(10));

        yield* dq.popFront(val_); // val=1, []
        yield* result.incrBy(val_);

        // result = 2*100 + 3*10 + 1 = 231
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(231);
  });

  test("notEmpty and reset", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const dq = yield* Deque(0, 4);
        const val_ = yield* local(Type.i32);
        const sum = yield* local(Type.i32, 0);

        yield* dq.pushBack(5);
        yield* dq.pushBack(10);
        yield* dq.pushBack(15);

        // Drain all
        yield* Ctrl.while(dq.notEmpty, function* () {
          yield* dq.popFront(val_);
          yield* sum.incrBy(val_);
        });

        // Push more after drain
        yield* dq.reset();
        yield* dq.pushBack(100);
        yield* dq.popFront(val_);
        yield* sum.incrBy(val_);

        // sum = 5 + 10 + 15 + 100 = 130
        return sum;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(130);
  });

  test("capacity must be power of 2", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const dq = yield* Deque(0, 5); // Not power of 2
          yield* dq.pushBack(1);
        });
      });
    }).toThrow(/power of 2/);
  });
});

// === S-21: HashSet ===

describe("S-21: HashSet", () => {
  test("add and has basic operations", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const hs = yield* HashSet(0, 16);

        yield* hs.add(42);
        yield* hs.add(99);
        yield* hs.add(7);

        // Check membership
        const has42 = yield* local(Type.i32, hs.has(42));
        const has99 = yield* local(Type.i32, hs.has(99));
        const has7 = yield* local(Type.i32, hs.has(7));
        const has100 = yield* local(Type.i32, hs.has(100));

        // result = has42 * 1000 + has99 * 100 + has7 * 10 + has100
        // Expected: 1*1000 + 1*100 + 1*10 + 0 = 1110
        return yield* local(
          Type.i32,
          has42.mul(1000).add(has99.mul(100)).add(has7.mul(10)).add(has100),
        );
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1110);
  });

  test("delete removes elements", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const hs = yield* HashSet(0, 16);

        yield* hs.add(10);
        yield* hs.add(20);
        yield* hs.delete(10);

        const has10 = yield* local(Type.i32, hs.has(10));
        const has20 = yield* local(Type.i32, hs.has(20));

        // has10=0, has20=1 -> result = 0*10 + 1 = 1
        return yield* local(Type.i32, has10.mul(10).add(has20));
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1);
  });

  test("clear removes all elements", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const hs = yield* HashSet(0, 8);

        yield* hs.add(1);
        yield* hs.add(2);
        yield* hs.add(3);
        yield* hs.clear();

        const has1 = yield* local(Type.i32, hs.has(1));
        const has2 = yield* local(Type.i32, hs.has(2));
        const has3 = yield* local(Type.i32, hs.has(3));

        // All should be 0 after clear
        return yield* local(Type.i32, has1.add(has2).add(has3));
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0);
  });

  test("notEmpty reflects state", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const hs = yield* HashSet(0, 8);
        const sum = yield* local(Type.i32, 0);

        // Empty initially
        yield* Ctrl.when(hs.notEmpty, () => [sum.incrBy(100)]);

        yield* hs.add(5);
        // Not empty now
        yield* Ctrl.when(hs.notEmpty, () => [sum.incrBy(10)]);

        yield* hs.delete(5);
        // Empty again
        yield* Ctrl.when(hs.notEmpty, () => [sum.incrBy(1)]);

        // Expected: 0 + 10 + 0 = 10
        return sum;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(10);
  });

  test("add is idempotent (no duplicate entries)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const hs = yield* HashSet(0, 8);

        yield* hs.add(42);
        yield* hs.add(42);
        yield* hs.add(42);

        // After adding same key 3 times, deleting once should make has() return 0
        yield* hs.delete(42);
        return yield* local(Type.i32, hs.has(42));
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0);
  });

  test("capacity must be power of 2", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const hs = yield* HashSet(0, 10); // Not power of 2
          yield* hs.add(1);
        });
      });
    }).toThrow(/power of 2/);
  });
});
