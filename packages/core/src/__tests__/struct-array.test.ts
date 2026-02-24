import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { Struct } from "../dsl/struct";
import { instantiate } from "../runtime/instantiate";

const Point = Struct({ x: "i32", y: "i32" });

describe("Struct.arrayAt", () => {
  test("get/set fields at fixed base", async () => {
    const BASE = 0;
    const binary = compile<{
      setPoint(i: number, x: number, y: number): void;
      getX(i: number): number;
      getY(i: number): number;
    }>(function* () {
      yield* Mod.memory(1);
      const points = Point.arrayAt(BASE);

      yield* Mod.exportFunc("setPoint", { i: "i32", x: "i32", y: "i32" }, function* (i, x, y) {
        yield* points.set(i, "x", x);
        yield* points.set(i, "y", y);
      });

      yield* Mod.exportFunc("getX", { i: "i32" }, function* (i) {
        return yield* points.get(i, "x");
      });

      yield* Mod.exportFunc("getY", { i: "i32" }, function* (i) {
        return yield* points.get(i, "y");
      });
    });

    const { exports } = await instantiate(binary);
    exports.setPoint(0, 10, 20);
    exports.setPoint(1, 30, 40);
    expect(exports.getX(0)).toBe(10);
    expect(exports.getY(0)).toBe(20);
    expect(exports.getX(1)).toBe(30);
    expect(exports.getY(1)).toBe(40);
  });

  test("at() proxy access", async () => {
    const BASE = 0;
    const binary = compile<{
      run(): number;
    }>(function* () {
      yield* Mod.memory(1);
      const points = Point.arrayAt(BASE);

      yield* Mod.exportFunc("run", function* () {
        const i = yield* local(Type.i32, 0);
        const p = points.at(i);
        yield* p.x.set(100);
        yield* p.y.set(200);
        return yield* p.x.add(p.y);
      });
    });

    const { exports } = await instantiate(binary);
    expect(exports.run()).toBe(300);
  });

  test("snapshot copies fields to locals", async () => {
    const BASE = 0;
    const binary = compile<{
      run(): number;
    }>(function* () {
      yield* Mod.memory(1);
      const points = Point.arrayAt(BASE);

      yield* Mod.exportFunc("run", function* () {
        const i = yield* local(Type.i32, 0);
        // Write via set
        yield* points.set(i, "x", 7);
        yield* points.set(i, "y", 3);
        // Snapshot
        const { x, y } = yield* points.snapshot(i, "x", "y");
        return yield* x.add(y);
      });
    });

    const { exports } = await instantiate(binary);
    expect(exports.run()).toBe(10);
  });

  test("non-zero base offset", async () => {
    const BASE = 64;
    const binary = compile<{
      set(i: number, x: number, y: number): void;
      getX(i: number): number;
    }>(function* () {
      yield* Mod.memory(1);
      const points = Point.arrayAt(BASE);

      yield* Mod.exportFunc("set", { i: "i32", x: "i32", y: "i32" }, function* (i, x, y) {
        yield* points.set(i, "x", x);
        yield* points.set(i, "y", y);
      });

      yield* Mod.exportFunc("getX", { i: "i32" }, function* (i) {
        return yield* points.get(i, "x");
      });
    });

    const { exports, mem } = await instantiate(binary);
    exports.set(0, 42, 99);
    expect(exports.getX(0)).toBe(42);
    // Verify it's actually at offset 64 in memory
    const view = new DataView(mem!.buffer);
    expect(view.getInt32(BASE, true)).toBe(42);
  });
});
