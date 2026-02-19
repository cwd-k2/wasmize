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
      const { exports: { run } } = await instantiate(binary);
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
      const { exports: { run } } = await instantiate(binary);
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
      const { exports: { run } } = await instantiate(binary);
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
      const { exports: { run } } = await instantiate(binary);
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
      const { exports: { getVal } } = await instantiate(binary);
      expect((getVal as Function)(0)).toBe(100);
      expect((getVal as Function)(1)).toBe(200);
      expect((getVal as Function)(2)).toBe(300);
    });
  });
});
