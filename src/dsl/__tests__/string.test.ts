import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Mod } from "../primitives";
import { Str } from "../string";
import { instantiate } from "../../test-helpers";

describe("Str", () => {
  describe("Str.from", () => {
    test("returns ptr, len, and bytes for data segment embedding", () => {
      const alloc = Mod.allocator();
      const s = Str.from(alloc, "Hello");
      expect(s.ptr).toBe(0);
      expect(s.len).toBe(5);
      expect(s.bytes).toEqual(new TextEncoder().encode("Hello"));
      expect(alloc.usedBytes).toBe(6); // 5 + null terminator
    });

    test("sequential allocations get non-overlapping regions", () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "Hi");
      const s2 = Str.from(alloc, "World");
      expect(s1.ptr).toBe(0);
      expect(s2.ptr).toBe(3); // "Hi" + null = 3 bytes
      expect(s2.len).toBe(5);
    });
  });

  describe("Str.len", () => {
    test("computes length of null-terminated string", async () => {
      const alloc = Mod.allocator();
      const hello = Str.from(alloc, "Hello");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(hello.ptr, new Uint8Array([...hello.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.len(hello.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBe(5);
    });

    test("empty string returns 0", async () => {
      const alloc = Mod.allocator();
      const empty = Str.from(alloc, "");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(empty.ptr, new Uint8Array([0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.len(empty.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBe(0);
    });
  });

  describe("Str.eq", () => {
    test("equal strings return 1", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "abc");
      const s2 = Str.from(alloc, "abc");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.eq(s1.ptr, s2.ptr, s1.len);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBe(1);
    });

    test("different strings return 0", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "abc");
      const s2 = Str.from(alloc, "abd");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.eq(s1.ptr, s2.ptr, s1.len);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBe(0);
    });
  });

  describe("Str.cmp", () => {
    test("equal strings return 0", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "abc");
      const s2 = Str.from(alloc, "abc");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.cmp(s1.ptr, s2.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBe(0);
    });

    test("lexicographically less returns negative", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "abc");
      const s2 = Str.from(alloc, "abd");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.cmp(s1.ptr, s2.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBeLessThan(0);
    });

    test("lexicographically greater returns positive", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "abd");
      const s2 = Str.from(alloc, "abc");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.cmp(s1.ptr, s2.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBeGreaterThan(0);
    });

    test("prefix comparison: shorter < longer", async () => {
      const alloc = Mod.allocator();
      const s1 = Str.from(alloc, "ab");
      const s2 = Str.from(alloc, "abc");

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.data(s1.ptr, new Uint8Array([...s1.bytes, 0]));
        yield* Mod.data(s2.ptr, new Uint8Array([...s2.bytes, 0]));
        yield* Mod.exportFunc("run", function* () {
          return yield* Str.cmp(s1.ptr, s2.ptr);
        });
      });
      const { exports: { run } } = await instantiate(binary);
      expect((run as Function)()).toBeLessThan(0);
    });
  });
});
