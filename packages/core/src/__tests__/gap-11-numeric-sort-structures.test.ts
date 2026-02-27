import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Mem, f64 } from "../dsl/primitives";
import { local, Type } from "../dsl/declarations";
import { set } from "../dsl/expr";
import { instantiate } from "../runtime/instantiate";
import {
  fixedFromInt, fixedFromF64, fixedToF64,
  fixedMul, fixedDiv,
} from "../stdlib/fixed";
import { modpow, modinv } from "../stdlib/modular";
import { countingSort, radixSort } from "../stdlib/sort-int";
import { SegmentTree } from "../dsl/segment-tree";
import { LRUCache } from "../dsl/lru-cache";

// ── S-08: Fixed Point Arithmetic ───────────────────────────────────

describe("S-08: Fixed Point Arithmetic", () => {
  test("fixedMul: 3 * 4 = 12 in Q16.16", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fromInt = yield* Mod.use(fixedFromInt);
      const mul = yield* Mod.use(fixedMul);

      yield* Mod.exportFunc("run", function* () {
        const a = yield* local(Type.i32, fromInt(3));
        const b = yield* local(Type.i32, fromInt(4));
        const product = yield* local(Type.i32, mul(a, b));
        // fromInt(12) = 12 << 16 = 786432
        return product;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    // 3 * 4 = 12 in Q16.16 = 12 << 16 = 786432
    expect((run as Function)()).toBe(12 << 16);
  });

  test("fixedMul: decimal precision (1.5 * 2.5 = 3.75)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fromF64 = yield* Mod.use(fixedFromF64);
      const mul = yield* Mod.use(fixedMul);

      yield* Mod.exportFunc("run", function* () {
        const a = yield* local(Type.i32, fromF64(f64(1.5)));
        const b = yield* local(Type.i32, fromF64(f64(2.5)));
        return yield* local(Type.i32, mul(a, b));
      });
    });
    const { exports: { run } } = await instantiate(binary);
    // 3.75 in Q16.16 = 3.75 * 65536 = 245760
    expect((run as Function)()).toBe(Math.round(3.75 * 65536));
  });

  test("fixedDiv: 10 / 3 gives correct Q16.16", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fromInt = yield* Mod.use(fixedFromInt);
      const div = yield* Mod.use(fixedDiv);
      const toF64 = yield* Mod.use(fixedToF64);

      yield* Mod.exportFunc("run", function* () {
        const a = yield* local(Type.i32, fromInt(10));
        const b = yield* local(Type.i32, fromInt(3));
        const quotient = yield* local(Type.i32, div(a, b));
        // Convert back to f64 to check
        yield* Mem.storeF64(0, toF64(quotient));
      });
    });
    const { exports, mem } = await instantiate(binary);
    (exports.run as Function)();
    const view = new Float64Array(mem!.buffer, 0, 1);
    // 10/3 = 3.333..., check within Q16.16 precision (~1/65536)
    expect(Math.abs(view[0]! - 10 / 3)).toBeLessThan(1 / 65536 + 0.0001);
  });

  test("fixedFromF64 and fixedToF64 roundtrip", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fromF64 = yield* Mod.use(fixedFromF64);
      const toF64 = yield* Mod.use(fixedToF64);

      yield* Mod.exportFunc("run", function* () {
        const fixed = yield* local(Type.i32, fromF64(f64(3.14)));
        yield* Mem.storeF64(0, toF64(fixed));
      });
    });
    const { exports, mem } = await instantiate(binary);
    (exports.run as Function)();
    const view = new Float64Array(mem!.buffer, 0, 1);
    // Q16.16 precision: ~0.00002
    expect(Math.abs(view[0]! - 3.14)).toBeLessThan(1 / 65536 + 0.0001);
  });
});

// ── S-10: Modular Arithmetic ───────────────────────────────────────

describe("S-10: Modular Arithmetic", () => {
  test("modpow: 2^10 mod 1000 = 24", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const mp = yield* Mod.use(modpow);
      yield* Mod.exportFunc("run", { base: Type.i32, exp: Type.i32, mod: Type.i32 }, function* (base, exp, mod) {
        return yield* mp(base, exp, mod);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as (b: number, e: number, m: number) => number;
    expect(f(2, 10, 1000)).toBe(24);
  });

  test("modpow: 3^13 mod 1000000007", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const mp = yield* Mod.use(modpow);
      yield* Mod.exportFunc("run", { base: Type.i32, exp: Type.i32, mod: Type.i32 }, function* (base, exp, mod) {
        return yield* mp(base, exp, mod);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as (b: number, e: number, m: number) => number;
    // 3^13 = 1594323, mod 1000000007 = 1594323
    expect(f(3, 13, 1000000007)).toBe(1594323);
  });

  test("modpow: known crypto value 7^256 mod 13", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const mp = yield* Mod.use(modpow);
      yield* Mod.exportFunc("run", { base: Type.i32, exp: Type.i32, mod: Type.i32 }, function* (base, exp, mod) {
        return yield* mp(base, exp, mod);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as (b: number, e: number, m: number) => number;
    // By Fermat's little theorem: 7^12 = 1 (mod 13), so 7^256 = 7^(12*21+4) = 7^4 = 2401 mod 13 = 9
    expect(f(7, 256, 13)).toBe(9);
  });

  test("modinv: a * modinv(a, m) = 1 (mod m)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const inv = yield* Mod.use(modinv);
      yield* Mod.exportFunc("run", { a: Type.i32, m: Type.i32 }, function* (a, m) {
        return yield* inv(a, m);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    const f = run as (a: number, m: number) => number;

    // modinv(3, 7) = 5, since 3*5 = 15 = 1 (mod 7)
    expect(f(3, 7)).toBe(5);

    // modinv(7, 11) = 8, since 7*8 = 56 = 1 (mod 11)
    expect(f(7, 11)).toBe(8);

    // Verify: a * inv(a, m) mod m == 1
    const inv17_23 = f(17, 23);
    expect((17 * inv17_23) % 23).toBe(1);
  });
});

// ── S-05: Counting Sort / Radix Sort ───────────────────────────────

describe("S-05: Counting Sort", () => {
  test("sorts small values correctly", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(countingSort);

      // countingSort(base, len, maxVal, tmpBase)
      yield* Mod.exportFunc("sort", { base: Type.i32, len: Type.i32, maxVal: Type.i32 }, function* (base, len, maxVal) {
        yield* sort.void(base, len, maxVal, 4096);
      });

      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load(addr);
      });

      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    // Write array [5, 3, 1, 4, 2] at byte offset 0 (word offsets 0..4)
    const data = [5, 3, 1, 4, 2];
    for (let i = 0; i < data.length; i++) {
      write(i * 4, data[i]);
    }

    // Sort with maxVal=5
    sort(0, 5, 5);

    // Read sorted result
    const result = [];
    for (let i = 0; i < 5; i++) {
      result.push(read(i * 4));
    }
    expect(result).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles duplicates", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(countingSort);

      yield* Mod.exportFunc("sort", { base: Type.i32, len: Type.i32, maxVal: Type.i32 }, function* (base, len, maxVal) {
        yield* sort.void(base, len, maxVal, 4096);
      });
    });
    const { exports, mem } = await instantiate(binary);
    const sort = exports.sort as Function;

    // Write array [3, 1, 3, 1, 2, 2]
    const view = new Int32Array(mem!.buffer, 0, 6);
    view.set([3, 1, 3, 1, 2, 2]);

    sort(0, 6, 3);

    expect(Array.from(view)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("S-05: Radix Sort", () => {
  test("sorts unsigned integers correctly", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(radixSort);

      // radixSort(base, len, tmpBase)
      yield* Mod.exportFunc("sort", { base: Type.i32, len: Type.i32 }, function* (base, len) {
        yield* sort.void(base, len, 8192);
      });
    });
    const { exports, mem } = await instantiate(binary);
    const sort = exports.sort as Function;

    // Write array at byte offset 0
    const data = [170, 45, 75, 90, 802, 24, 2, 66];
    const view = new Int32Array(mem!.buffer, 0, data.length);
    view.set(data);

    sort(0, data.length);

    expect(Array.from(view)).toEqual([2, 24, 45, 66, 75, 90, 170, 802]);
  });

  test("sorts already sorted array", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(radixSort);

      yield* Mod.exportFunc("sort", { base: Type.i32, len: Type.i32 }, function* (base, len) {
        yield* sort.void(base, len, 8192);
      });
    });
    const { exports, mem } = await instantiate(binary);
    const sort = exports.sort as Function;

    const data = [1, 2, 3, 4, 5];
    const view = new Int32Array(mem!.buffer, 0, data.length);
    view.set(data);

    sort(0, data.length);

    expect(Array.from(view)).toEqual([1, 2, 3, 4, 5]);
  });

  test("sorts array with large values", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(radixSort);

      yield* Mod.exportFunc("sort", { base: Type.i32, len: Type.i32 }, function* (base, len) {
        yield* sort.void(base, len, 8192);
      });
    });
    const { exports, mem } = await instantiate(binary);
    const sort = exports.sort as Function;

    const data = [100000, 50000, 200000, 1, 99999];
    const view = new Uint32Array(mem!.buffer, 0, data.length);
    view.set(data);

    sort(0, data.length);

    expect(Array.from(view)).toEqual([1, 50000, 99999, 100000, 200000]);
  });
});

// ── S-24: Segment Tree ─────────────────────────────────────────────

describe("S-24: Segment Tree", () => {
  test("build + query full range", async () => {
    // Use n=8 (power of 2)
    const N = 8;
    const binary = compile(function* () {
      yield* Mod.memory(1);
      // Tree at byte offset 0 (needs 2*N = 16 i32 words = 64 bytes)
      // Source array at byte offset 256
      yield* Mod.exportFunc("run", function* () {
        const st = yield* SegmentTree(0, N);
        yield* st.build(256);
        // Query full range [0, N)
        return yield* st.query(0, N);
      });

      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });
    const { exports } = await instantiate(binary);
    const run = exports.run as Function;
    const write = exports.write as Function;

    // Write source array at byte offset 256: [1, 2, 3, 4, 5, 6, 7, 8]
    for (let i = 0; i < N; i++) {
      write(256 + i * 4, i + 1);
    }

    // Sum of 1..8 = 36
    expect(run()).toBe(36);
  });

  test("build + partial query", async () => {
    const N = 8;
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("query", { l: Type.i32, r: Type.i32 }, function* (l, r) {
        const st = yield* SegmentTree(0, N);
        yield* st.build(256);
        return yield* st.query(l, r);
      });

      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });
    const { exports } = await instantiate(binary);
    const query = exports.query as Function;
    const write = exports.write as Function;

    // Source: [1, 2, 3, 4, 5, 6, 7, 8]
    for (let i = 0; i < N; i++) {
      write(256 + i * 4, i + 1);
    }

    // Query [2, 5) = 3 + 4 + 5 = 12
    expect(query(2, 5)).toBe(12);
    // Query [0, 1) = 1
    expect(query(0, 1)).toBe(1);
    // Query [6, 8) = 7 + 8 = 15
    expect(query(6, 8)).toBe(15);
  });

  test("update and re-query", async () => {
    const N = 4;
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const st = yield* SegmentTree(0, N);
        yield* st.build(256);
        const result = yield* local(Type.i32, 0);

        // Initial sum [0, 4) = 1+2+3+4 = 10
        const s1 = yield* st.query(0, N);
        yield* set(result, s1);

        // Update index 1 from 2 to 10
        yield* st.update(1, 10);

        // New sum [0, 4) = 1+10+3+4 = 18
        const s2 = yield* st.query(0, N);
        yield* result.mulBy(100);
        yield* result.incrBy(s2);

        // Encode: initial*100 + updated = 1018
        return result;
      });

      yield* Mod.exportFunc("write", { addr: Type.i32, val: Type.i32 }, function* (addr, val) {
        yield* Mem.store(addr, val);
      });
    });
    const { exports } = await instantiate(binary);
    const write = exports.write as Function;

    // Source: [1, 2, 3, 4]
    for (let i = 0; i < N; i++) {
      write(256 + i * 4, i + 1);
    }

    expect((exports.run as Function)()).toBe(1018);
  });
});

// ── S-26: LRU Cache ────────────────────────────────────────────────

describe("S-26: LRU Cache", () => {
  test("get returns 0 for miss, 1 for hit", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("run", function* () {
        const cache = yield* LRUCache(0, 4);
        const dst = yield* local(Type.i32);
        const result = yield* local(Type.i32, 0);

        // Miss: get(42) should return 0
        const miss = yield* cache.get(42, dst);
        yield* set(result, miss);

        // Put key=42, val=100
        yield* cache.put(42, 100);

        // Hit: get(42) should return 1, dst should be 100
        const hit = yield* cache.get(42, dst);
        yield* result.mulBy(10);
        yield* result.incrBy(hit);
        yield* result.mulBy(1000);
        yield* result.incrBy(dst); // dst = 100

        // Encode: miss*10000 + hit*1000 + dst = 0*10000 + 1*1000 + 100 = 1100
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1100);
  });

  test("put updates existing key", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("run", function* () {
        const cache = yield* LRUCache(0, 4);
        const dst = yield* local(Type.i32);

        yield* cache.put(10, 100);
        yield* cache.put(10, 200); // update

        yield* cache.get(10, dst);
        return dst; // should be 200
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(200);
  });

  test("eviction on capacity overflow", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("run", function* () {
        // capacity = 4
        const cache = yield* LRUCache(0, 4);
        const dst = yield* local(Type.i32);
        const result = yield* local(Type.i32, 0);

        // Fill cache: keys 1, 2, 3, 4
        yield* cache.put(1, 10);
        yield* cache.put(2, 20);
        yield* cache.put(3, 30);
        yield* cache.put(4, 40);

        // All should be present
        const h1 = yield* cache.get(1, dst);
        yield* set(result, h1); // 1

        // Add key 5 — should evict one entry
        yield* cache.put(5, 50);

        // Key 5 should be present
        const h5 = yield* cache.get(5, dst);
        yield* result.mulBy(10);
        yield* result.incrBy(h5); // 1

        // Count how many of keys 1-4 are still present (should be 3 — one was evicted)
        const totalPresent = yield* local(Type.i32, 0);
        const h2 = yield* cache.get(1, dst);
        yield* totalPresent.incrBy(h2);
        const h3 = yield* cache.get(2, dst);
        yield* totalPresent.incrBy(h3);
        const h4 = yield* cache.get(3, dst);
        yield* totalPresent.incrBy(h4);
        const h4b = yield* cache.get(4, dst);
        yield* totalPresent.incrBy(h4b);

        yield* result.mulBy(10);
        yield* result.incrBy(totalPresent); // 3

        // Encode: 113 (h1=1, h5=1, totalPresent=3)
        return result;
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(113);
  });

  test("access order updates prevent eviction of recently used", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("run", function* () {
        const cache = yield* LRUCache(0, 4);
        const dst = yield* local(Type.i32);

        // Fill: keys 1, 2, 3, 4
        yield* cache.put(1, 10);
        yield* cache.put(2, 20);
        yield* cache.put(3, 30);
        yield* cache.put(4, 40);

        // Access key 1 (makes it recently used)
        yield* cache.get(1, dst);

        // Add key 5 — should evict key 2 (the LRU among {2, 3, 4} since 1 was just accessed)
        yield* cache.put(5, 50);

        // Key 1 should still be present
        const h1 = yield* cache.get(1, dst);

        return h1; // should be 1
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(1);
  });

  test("clear removes all entries", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("run", function* () {
        const cache = yield* LRUCache(0, 4);
        const dst = yield* local(Type.i32);
        const result = yield* local(Type.i32, 0);

        yield* cache.put(1, 10);
        yield* cache.put(2, 20);

        yield* cache.clear();

        // Both should now be misses
        const m1 = yield* cache.get(1, dst);
        yield* set(result, m1);
        const m2 = yield* cache.get(2, dst);
        yield* result.incrBy(m2);

        return result; // 0 + 0 = 0
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(0);
  });
});
