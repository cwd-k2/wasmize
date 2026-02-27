import { describe, test, expect } from "vitest";
import { Struct } from "../dsl/struct";
import { compile } from "../dsl/compiler";
import { Mod } from "../dsl/primitives";
import { instantiate } from "../runtime/instantiate";

describe("V-09: Struct field name typo detection", () => {
  const Point = Struct({ x: "i32", y: "i32" });

  test("Struct.at() proxy throws on unknown field", () => {
    const p = Point.at(0);
    expect(() => (p as any).xpos).toThrow(
      "Unknown field 'xpos' on Struct. Available fields: x, y",
    );
  });

  test("Struct.get() throws on unknown field", () => {
    expect(() => Point.get(0, "z" as any)).toThrow(
      "Unknown field 'z' on Struct. Available fields: x, y",
    );
  });

  test("Struct.set() throws on unknown field", () => {
    expect(() => Point.set(0, "z" as any, 0)).toThrow(
      "Unknown field 'z' on Struct. Available fields: x, y",
    );
  });

  test("StructArray.at() proxy throws on unknown field", () => {
    const alloc = Mod.allocator();
    const points = Point.array(alloc, 4);
    const p = points.at(0);
    expect(() => (p as any).xpos).toThrow(
      "Unknown field 'xpos' on Struct. Available fields: x, y",
    );
  });

  test("StructArray.get() throws on unknown field", () => {
    const alloc = Mod.allocator();
    const points = Point.array(alloc, 4);
    expect(() => points.get(0, "z" as any)).toThrow(
      "Unknown field 'z' on Struct. Available fields: x, y",
    );
  });

  test("StructArray.set() throws on unknown field", () => {
    const alloc = Mod.allocator();
    const points = Point.array(alloc, 4);
    expect(() => points.set(0, "z" as any, 0)).toThrow(
      "Unknown field 'z' on Struct. Available fields: x, y",
    );
  });

  test("error message shows all available fields", () => {
    const RGBA = Struct({ r: "u8", g: "u8", b: "u8", a: "u8" });
    const pix = RGBA.at(0);
    expect(() => (pix as any).red).toThrow(
      "Available fields: r, g, b, a",
    );
  });

  test("correct field access still works", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("run", function* () {
        const p = Point.at(0);
        yield* p.x.set(10);
        yield* p.y.set(20);
        return yield* p.x.add(p.y);
      });
    });
    const { exports: { run } } = await instantiate(binary);
    expect((run as Function)()).toBe(30);
  });
});
