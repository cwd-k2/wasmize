import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { local, Type, Mod, Ctrl } from "../primitives";
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
