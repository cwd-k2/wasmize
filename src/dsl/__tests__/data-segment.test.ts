import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Mem } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("Data Segment", () => {
  test("raw bytes are initialized in memory", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([1, 2, 3, 4]));
      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    expect((read as Function)(0)).toBe(1);
    expect((read as Function)(1)).toBe(2);
    expect((read as Function)(2)).toBe(3);
    expect((read as Function)(3)).toBe(4);
  });

  test("i32 values via data segment", async () => {
    // Little-endian i32: 0x04030201
    const bytes = new Uint8Array([0x01, 0x03, 0x00, 0x00, 0x2a, 0x00, 0x00, 0x00]);
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, bytes);
      yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.load(idx.mul(4));
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    expect((read as Function)(0)).toBe(0x0301);
    expect((read as Function)(1)).toBe(42);
  });

  test("data segment at non-zero offset", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(100, new Uint8Array([0xff, 0xfe]));
      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    expect((read as Function)(100)).toBe(0xff);
    expect((read as Function)(101)).toBe(0xfe);
    expect((read as Function)(99)).toBe(0); // untouched
  });

  test("dataString embeds UTF-8", async () => {
    const str = "Hello";
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.dataString(0, str);
      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    expect((read as Function)(0)).toBe(0x48); // 'H'
    expect((read as Function)(1)).toBe(0x65); // 'e'
    expect((read as Function)(2)).toBe(0x6c); // 'l'
    expect((read as Function)(3)).toBe(0x6c); // 'l'
    expect((read as Function)(4)).toBe(0x6f); // 'o'
  });

  test("multiple data segments", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([10, 20]));
      yield* Mod.data(10, new Uint8Array([30, 40]));
      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    expect((read as Function)(0)).toBe(10);
    expect((read as Function)(1)).toBe(20);
    expect((read as Function)(10)).toBe(30);
    expect((read as Function)(11)).toBe(40);
  });

  test("dataString with multibyte UTF-8", async () => {
    const str = "日本";
    const encoded = new TextEncoder().encode(str);
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.dataString(0, str);
      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });
    const {
      exports: { read },
    } = await instantiate(binary);
    for (let i = 0; i < encoded.length; i++) {
      expect((read as Function)(i)).toBe(encoded[i]);
    }
  });
});
