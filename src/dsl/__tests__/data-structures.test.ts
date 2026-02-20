import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { local, locals, Type, Mod, Mem, Ctrl, MinHeap, HashMap } from "../primitives";
import { Stack } from "../stack";
import { BitSet } from "../bitset";
import { RingBuffer } from "../ringbuffer";
import { instantiate } from "../../runtime/instantiate";

// --- Stack ---

describe("Stack", () => {
  test("push/pop (LIFO order)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const s = yield* Stack(0);
          const dst = yield* local(Type.i32);
          yield* s.push(10);
          yield* s.push(20);
          yield* s.push(30);
          yield* s.pop(dst); // 30
          return dst;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(30);
  });

  test("notEmpty reflects stack state", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const s = yield* Stack(0);
          const result = yield* local(Type.i32, 0);
          const dst = yield* local(Type.i32);
          // Empty stack → notEmpty should be 0
          yield* Ctrl.when(s.notEmpty, () => [result.set(1)]);
          yield* s.push(42);
          // Non-empty → notEmpty should be 1
          yield* Ctrl.when(s.notEmpty, () => [result.set(result.add(10))]);
          yield* s.pop(dst);
          // Empty again
          yield* Ctrl.when(s.notEmpty, () => [result.set(result.add(100))]);
          return result;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(10);
  });

  test("peek reads without removing", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const s = yield* Stack(0);
          const dst = yield* local(Type.i32);
          const result = yield* local(Type.i32, 0);
          yield* s.push(10);
          yield* s.push(20);
          // peek returns top (20), store it
          yield* result.set(s.peek());
          // pop also returns 20 (peek didn't remove)
          yield* s.pop(dst);
          // result(20) + dst(20) = 40
          return yield* result.add(dst);
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(40);
  });

  test("reset empties the stack", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const s = yield* Stack(0);
          const result = yield* local(Type.i32, 0);
          yield* s.push(1);
          yield* s.push(2);
          yield* s.reset();
          yield* Ctrl.when(s.notEmpty, () => [result.set(1)]);
          return result;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(0);
  });
});

// --- BitSet ---

describe("BitSet", () => {
  test("set/get bits", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const bs = BitSet(0);
      yield* Mod.exportFunc("setBit", { idx: Type.i32 }, function* (idx) {
        yield* bs.set(idx);
      });
      yield* Mod.exportFunc("getBit", { idx: Type.i32 }, function* (idx) {
        return yield* bs.get(idx);
      });
    });
    const { exports } = await instantiate(binary);
    const setBit = exports.setBit as Function;
    const getBit = exports.getBit as Function;

    expect(getBit(0)).toBe(0);
    setBit(0);
    expect(getBit(0)).toBe(1);
    expect(getBit(1)).toBe(0);
    setBit(7);
    expect(getBit(7)).toBe(1);
    expect(getBit(6)).toBe(0);
  });

  test("set/get across byte boundaries", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const bs = BitSet(0);
      yield* Mod.exportFunc("setBit", { idx: Type.i32 }, function* (idx) {
        yield* bs.set(idx);
      });
      yield* Mod.exportFunc("getBit", { idx: Type.i32 }, function* (idx) {
        return yield* bs.get(idx);
      });
    });
    const { exports } = await instantiate(binary);
    const setBit = exports.setBit as Function;
    const getBit = exports.getBit as Function;

    setBit(8); // second byte, bit 0
    expect(getBit(8)).toBe(1);
    expect(getBit(0)).toBe(0);
    setBit(15); // second byte, bit 7
    expect(getBit(15)).toBe(1);
    expect(getBit(9)).toBe(0);
  });

  test("clear bit", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const bs = BitSet(0);
      yield* Mod.exportFunc("setBit", { idx: Type.i32 }, function* (idx) {
        yield* bs.set(idx);
      });
      yield* Mod.exportFunc("clearBit", { idx: Type.i32 }, function* (idx) {
        yield* bs.clear(idx);
      });
      yield* Mod.exportFunc("getBit", { idx: Type.i32 }, function* (idx) {
        return yield* bs.get(idx);
      });
    });
    const { exports } = await instantiate(binary);
    const setBit = exports.setBit as Function;
    const clearBit = exports.clearBit as Function;
    const getBit = exports.getBit as Function;

    setBit(5);
    setBit(6);
    expect(getBit(5)).toBe(1);
    clearBit(5);
    expect(getBit(5)).toBe(0);
    expect(getBit(6)).toBe(1); // neighbor unaffected
  });

  test("clearAll zeroes all bits", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const bs = BitSet(0);
      yield* Mod.exportFunc("setBit", { idx: Type.i32 }, function* (idx) {
        yield* bs.set(idx);
      });
      yield* Mod.exportFunc("clearAll", function* () {
        yield* bs.clearAll(16);
      });
      yield* Mod.exportFunc("getBit", { idx: Type.i32 }, function* (idx) {
        return yield* bs.get(idx);
      });
    });
    const { exports } = await instantiate(binary);
    const setBit = exports.setBit as Function;
    const clearAll = exports.clearAll as Function;
    const getBit = exports.getBit as Function;

    setBit(0);
    setBit(7);
    setBit(8);
    setBit(15);
    clearAll();
    expect(getBit(0)).toBe(0);
    expect(getBit(7)).toBe(0);
    expect(getBit(8)).toBe(0);
    expect(getBit(15)).toBe(0);
  });
});

// --- RingBuffer ---

describe("RingBuffer", () => {
  test("write/read basic ordering (FIFO)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const rb = yield* RingBuffer(0, 8); // power of 2
          const dst = yield* local(Type.i32);
          yield* rb.write(10);
          yield* rb.write(20);
          yield* rb.write(30);
          yield* rb.read(dst); // should be 10 (FIFO)
          return dst;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(10);
  });

  test("isEmpty and isFull", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const rb = yield* RingBuffer(0, 2);
          const result = yield* local(Type.i32, 0);
          const dst = yield* local(Type.i32);
          // Initially empty
          yield* Ctrl.when(rb.isEmpty, () => [result.incrBy(1)]);
          yield* rb.write(1);
          yield* rb.write(2);
          // Now full
          yield* Ctrl.when(rb.isFull, () => [result.incrBy(10)]);
          yield* rb.read(dst);
          // Not full anymore
          yield* Ctrl.when(rb.isFull, () => [result.incrBy(100)]);
          return result;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(11); // 1 + 10
  });

  test("wrap-around (power of 2)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const rb = yield* RingBuffer(0, 4); // capacity 4
          const dst = yield* local(Type.i32);
          // Fill and read to force wrapping
          yield* rb.write(1);
          yield* rb.write(2);
          yield* rb.write(3);
          yield* rb.read(dst); // 1
          yield* rb.read(dst); // 2
          yield* rb.write(4);
          yield* rb.write(5); // wraps around
          yield* rb.read(dst); // 3
          yield* rb.read(dst); // 4
          yield* rb.read(dst); // 5
          return dst;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(5);
  });

  test("non-power-of-2 capacity", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const rb = yield* RingBuffer(0, 3); // non-pow2
          const dst = yield* local(Type.i32);
          yield* rb.write(10);
          yield* rb.write(20);
          yield* rb.read(dst); // 10
          yield* rb.write(30);
          yield* rb.write(40); // wraps
          yield* rb.read(dst); // 20
          yield* rb.read(dst); // 30
          yield* rb.read(dst); // 40
          return dst;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(40);
  });

  test("reset empties the buffer", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc(
        "test",
        function* () {
          const rb = yield* RingBuffer(0, 4);
          const result = yield* local(Type.i32, 0);
          yield* rb.write(1);
          yield* rb.write(2);
          yield* rb.reset();
          yield* Ctrl.when(rb.isEmpty, () => [result.set(1)]);
          yield* Ctrl.when(rb.isFull, () => [result.incrBy(10)]);
          return result;
        },
      );
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(1);
  });
});

// --- MinHeap ---

describe("MinHeap", () => {
  test("insert and extractMin return elements in priority order", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const heap = yield* MinHeap(0);
        const [dstPri, dstVal, result] = yield* locals(Type.i32, Type.i32, ["i32", 0]);

        yield* heap.insert(30, 300);
        yield* heap.insert(10, 100);
        yield* heap.insert(20, 200);

        yield* heap.extractMin(dstPri, dstVal);
        yield* result.set(dstVal); // 100

        yield* heap.extractMin(dstPri, dstVal);
        yield* result.set(result.mul(1000).add(dstVal)); // 100200

        yield* heap.extractMin(dstPri, dstVal);
        yield* result.set(result.mul(1000).add(dstVal)); // 100200300

        return result;
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(100200300);
  });

  test("peek returns min without removing", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const heap = yield* MinHeap(0);

        yield* heap.insert(5, 50);
        yield* heap.insert(3, 30);
        yield* heap.insert(7, 70);

        const pri = yield* local(Type.i32);
        const val = yield* local(Type.i32);
        yield* pri.set(heap.peekPriority());
        yield* val.set(heap.peekValue());

        const pri2 = yield* local(Type.i32);
        yield* pri2.set(heap.peekPriority());

        return yield* pri.mul(1000).add(val).mul(10).add(pri2);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(30303);
  });

  test("notEmpty reflects heap state", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const heap = yield* MinHeap(0);
        const [dstPri, dstVal] = yield* locals(Type.i32, Type.i32);
        const result = yield* local(Type.i32, 0);

        yield* Ctrl.when(heap.notEmpty, () => [result.set(1)]);

        yield* heap.insert(10, 1);
        yield* Ctrl.when(heap.notEmpty, () => [result.incrBy(10)]);

        yield* heap.extractMin(dstPri, dstVal);
        yield* Ctrl.when(heap.notEmpty, () => [result.incrBy(100)]);

        return result;
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(10);
  });

  test("reset clears the heap", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const heap = yield* MinHeap(0);
        yield* heap.insert(1, 10);
        yield* heap.insert(2, 20);
        yield* heap.reset();

        const result = yield* local(Type.i32, 0);
        yield* Ctrl.when(heap.notEmpty, () => [result.set(1)]);
        return result;
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(0);
  });

  test("multiple extracts produce sorted order", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const resultArr = Mem.i32Array(0);

      yield* Mod.exportFunc("test", function* () {
        const heap = yield* MinHeap(256);
        const [dstPri, dstVal, i] = yield* locals(Type.i32, Type.i32, Type.i32);

        yield* heap.insert(50, 5);
        yield* heap.insert(10, 1);
        yield* heap.insert(40, 4);
        yield* heap.insert(20, 2);
        yield* heap.insert(30, 3);

        yield* Ctrl.range(i, 5, function* () {
          yield* heap.extractMin(dstPri, dstVal);
          yield* resultArr.store(i, dstVal);
        });

        return yield* resultArr
          .load(0)
          .mul(10000)
          .add(resultArr.load(1).mul(1000))
          .add(resultArr.load(2).mul(100))
          .add(resultArr.load(3).mul(10))
          .add(resultArr.load(4));
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(12345);
  });
});

// --- HashMap ---

describe("HashMap", () => {
  test("basic set and get", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 16);
        const dst = yield* local(Type.i32);

        yield* map.set(42, 100);
        yield* map.set(7, 200);
        yield* map.get(42, dst);
        const r1 = yield* local(Type.i32);
        yield* r1.set(dst);
        yield* map.get(7, dst);
        return yield* r1.mul(1000).add(dst);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(100200);
  });

  test("capacity must be power of 2", () => {
    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("test", function* () {
          yield* HashMap(0, 10);
        });
      });
    }).toThrow(/power of 2/);
  });

  test("has returns 1 for existing keys, 0 for absent", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 8);
        yield* map.set(5, 50);
        const h1 = yield* local(Type.i32);
        const h2 = yield* local(Type.i32);
        yield* h1.set(map.has(5));
        yield* h2.set(map.has(99));
        return yield* h1.mul(10).add(h2);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(10);
  });

  test("set overwrites existing key", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 8);
        const dst = yield* local(Type.i32);
        yield* map.set(1, 100);
        yield* map.set(1, 999);
        yield* map.get(1, dst);
        return dst;
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(999);
  });

  test("delete removes a key", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 8);
        const dst = yield* local(Type.i32);
        yield* map.set(1, 100);
        yield* map.set(2, 200);
        yield* map.delete(1);
        const h = yield* local(Type.i32);
        yield* h.set(map.has(1));
        yield* map.get(2, dst);
        return yield* h.mul(1000).add(dst);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(200);
  });

  test("clear resets everything", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 8);
        yield* map.set(1, 10);
        yield* map.set(2, 20);
        yield* map.clear();
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.when(map.notEmpty, () => [result.set(1)]);
        const h = yield* local(Type.i32);
        yield* h.set(map.has(1));
        return yield* result.mul(10).add(h);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(0);
  });

  test("handles hash collisions via linear probing", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(2);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 4);
        const dst = yield* local(Type.i32);

        yield* map.set(0, 100);
        yield* map.set(4, 200);
        yield* map.set(8, 300);

        yield* map.get(0, dst);
        const r0 = yield* local(Type.i32);
        yield* r0.set(dst);

        yield* map.get(4, dst);
        const r4 = yield* local(Type.i32);
        yield* r4.set(dst);

        yield* map.get(8, dst);

        return yield* r0.add(r4).add(dst);
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(600);
  });

  test("notEmpty reflects map state", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("test", function* () {
        const map = yield* HashMap(0, 8);
        const result = yield* local(Type.i32, 0);
        yield* Ctrl.when(map.notEmpty, () => [result.incrBy(1)]);
        yield* map.set(1, 10);
        yield* Ctrl.when(map.notEmpty, () => [result.incrBy(10)]);
        yield* map.delete(1);
        yield* Ctrl.when(map.notEmpty, () => [result.incrBy(100)]);
        return result;
      });
    });
    const { exports } = await instantiate(binary);
    expect((exports.test as Function)()).toBe(10);
  });
});
