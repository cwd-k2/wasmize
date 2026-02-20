import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Mod, f64 } from "../primitives";
import { Struct } from "../struct";
import { instantiate } from "../../test-helpers";

describe("Struct", () => {
  describe("layout calculation", () => {
    test("simple i32 fields", () => {
      const s = Struct({ x: "i32", y: "i32" });
      expect(s.fields.x).toEqual({ offset: 0, type: "i32" });
      expect(s.fields.y).toEqual({ offset: 4, type: "i32" });
      expect(s.size).toBe(8);
    });

    test("mixed types with alignment padding", () => {
      const s = Struct({ a: "i32", b: "i64" });
      expect(s.fields.a).toEqual({ offset: 0, type: "i32" });
      // b needs 8-byte alignment, so padding after a
      expect(s.fields.b).toEqual({ offset: 8, type: "i64" });
      expect(s.size).toBe(16);
    });

    test("trailing padding for array stride", () => {
      // i64 (8 bytes at 0) + i32 (4 bytes at 8) = 12 bytes
      // but max align is 8, so size padded to 16
      const s = Struct({ big: "i64", small: "i32" });
      expect(s.fields.big).toEqual({ offset: 0, type: "i64" });
      expect(s.fields.small).toEqual({ offset: 8, type: "i32" });
      expect(s.size).toBe(16);
    });

    test("f64 alignment", () => {
      const s = Struct({ x: "i32", y: "f64" });
      expect(s.fields.x).toEqual({ offset: 0, type: "i32" });
      expect(s.fields.y).toEqual({ offset: 8, type: "f64" });
      expect(s.size).toBe(16);
    });

    test("all i32 fields pack tightly", () => {
      const s = Struct({ a: "i32", b: "i32", c: "i32" });
      expect(s.fields.a.offset).toBe(0);
      expect(s.fields.b.offset).toBe(4);
      expect(s.fields.c.offset).toBe(8);
      expect(s.size).toBe(12);
    });
  });

  describe("get/set with Wasm", () => {
    test("i32 struct get/set at base address", async () => {
      const Point = Struct({ x: "i32", y: "i32" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Point.set(0, "x", 10);
          yield* Point.set(0, "y", 20);
          // x + y
          return yield* Point.get(0, "x").add(Point.get(0, "y"));
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(30);
    });

    test("struct at non-zero base", async () => {
      const Point = Struct({ x: "i32", y: "i32" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Point.set(100, "x", 42);
          return yield* Point.get(100, "x");
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(42);
    });

    test("mixed type struct", async () => {
      const Record = Struct({ id: "i32", value: "f64" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Record.set(0, "id", 1);
          yield* Record.set(0, "value", f64(3.14));
          return yield* Record.get(0, "value");
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBeCloseTo(3.14);
    });
  });

  describe("StructArray", () => {
    test("array of structs with allocator", async () => {
      const Point = Struct({ x: "i32", y: "i32" });
      const alloc = Mod.allocator();
      const points = Point.array(alloc, 4);

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.exportFunc("run", function* () {
          // points[0] = { x: 10, y: 20 }
          yield* points.set(0, "x", 10);
          yield* points.set(0, "y", 20);
          // points[2] = { x: 30, y: 40 }
          yield* points.set(2, "x", 30);
          yield* points.set(2, "y", 40);
          // return points[2].x + points[0].y
          return yield* points.get(2, "x").add(points.get(0, "y"));
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(50);
    });

    test("array with dynamic index", async () => {
      const Item = Struct({ value: "i32" });
      const alloc = Mod.allocator();
      const items = Item.array(alloc, 10);

      const binary = compile(function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.exportFunc("getVal", { idx: "i32" as const }, function* (idx) {
          yield* items.set(0, "value", 100);
          yield* items.set(1, "value", 200);
          yield* items.set(2, "value", 300);
          return yield* items.get(idx, "value");
        });
      });
      const {
        exports: { getVal },
      } = await instantiate(binary);
      expect((getVal as Function)(0)).toBe(100);
      expect((getVal as Function)(1)).toBe(200);
      expect((getVal as Function)(2)).toBe(300);
    });
  });

  describe("packed fields (u8/u16)", () => {
    test("u8/u16 layout calculation", () => {
      const s = Struct({ flags: "u8", count: "u16", value: "i32" });
      expect(s.fields.flags).toEqual({ offset: 0, type: "u8" });
      // u16 needs 2-byte alignment → padding after u8
      expect(s.fields.count).toEqual({ offset: 2, type: "u16" });
      // i32 needs 4-byte alignment
      expect(s.fields.value).toEqual({ offset: 4, type: "i32" });
      expect(s.size).toBe(8);
    });

    test("u8 roundtrip", async () => {
      const Pix = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* Pix.set(0, "r", 255);
          yield* Pix.set(0, "g", 128);
          yield* Pix.set(0, "b", 64);
          yield* Pix.set(0, "a", 32);
          // r + g + b + a
          return yield* Pix.get(0, "r")
            .add(Pix.get(0, "g"))
            .add(Pix.get(0, "b"))
            .add(Pix.get(0, "a"));
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(255 + 128 + 64 + 32);
    });

    test("u16 roundtrip", async () => {
      const S = Struct({ a: "u16", b: "u16" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          yield* S.set(0, "a", 1000);
          yield* S.set(0, "b", 2000);
          return yield* S.get(0, "a").add(S.get(0, "b"));
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(3000);
    });

    test("packed struct total size", () => {
      const s = Struct({ a: "u8", b: "u8", c: "u8" });
      expect(s.size).toBe(3);
    });
  });

  describe("FieldAccessor.at() and mutations", () => {
    test("FieldAccessor read/write via .at()", async () => {
      const Point = Struct({ x: "i32", y: "i32" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const p = Point.at(0);
          yield* p.x.set(10);
          yield* p.y.set(20);
          return yield* p.x.add(p.y);
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(30);
    });

    test("FieldAccessor.incrBy()", async () => {
      const Counter = Struct({ value: "i32" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const c = Counter.at(0);
          yield* c.value.set(10);
          yield* c.value.incrBy(5);
          yield* c.value.incrBy(3);
          return yield* Counter.get(0, "value");
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(18);
    });

    test("FieldAccessor.decrBy() and .mulBy()", async () => {
      const S = Struct({ v: "i32" });

      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("run", function* () {
          const s = S.at(0);
          yield* s.v.set(100);
          yield* s.v.decrBy(20);
          yield* s.v.mulBy(3);
          return yield* S.get(0, "v");
        });
      });
      const {
        exports: { run },
      } = await instantiate(binary);
      expect((run as Function)()).toBe(240); // (100 - 20) * 3
    });
  });
});
