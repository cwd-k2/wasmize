import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod, Mem } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";

describe("Mem.byteGrid3D", () => {
  const X_SIZE = 4;
  const Y_SIZE = 3;
  const BASE = 0;

  test("store and load at 3D coordinates", async () => {
    const binary = compile<{
      store3d(x: number, y: number, z: number, v: number): void;
      load3d(x: number, y: number, z: number): number;
    }>(function* () {
      yield* Mod.memory(1);
      const grid = Mem.byteGrid3D(BASE, X_SIZE, Y_SIZE);

      yield* Mod.exportFunc(
        "store3d",
        { x: "i32", y: "i32", z: "i32", v: "i32" },
        function* (x, y, z, v) {
          yield* grid.store(x, y, z, v);
        },
      );

      yield* Mod.exportFunc(
        "load3d",
        { x: "i32", y: "i32", z: "i32" },
        function* (x, y, z) {
          return yield* grid.load(x, y, z);
        },
      );
    });

    const { exports } = await instantiate(binary);

    // Store values at different 3D positions
    exports.store3d(0, 0, 0, 1);
    exports.store3d(1, 0, 0, 2);
    exports.store3d(0, 1, 0, 3);
    exports.store3d(0, 0, 1, 4);
    exports.store3d(3, 2, 1, 255);

    // Read them back
    expect(exports.load3d(0, 0, 0)).toBe(1);
    expect(exports.load3d(1, 0, 0)).toBe(2);
    expect(exports.load3d(0, 1, 0)).toBe(3);
    expect(exports.load3d(0, 0, 1)).toBe(4);
    expect(exports.load3d(3, 2, 1)).toBe(255);
  });

  test("address layout: x + y*xSize + z*(xSize*ySize)", async () => {
    // Verify that addr = x + y*xSize + z*(xSize*ySize) + base
    const binary = compile<{
      store3d(x: number, y: number, z: number, v: number): void;
    }>(function* () {
      yield* Mod.memory(1);
      const grid = Mem.byteGrid3D(BASE, X_SIZE, Y_SIZE);

      yield* Mod.exportFunc(
        "store3d",
        { x: "i32", y: "i32", z: "i32", v: "i32" },
        function* (x, y, z, v) {
          yield* grid.store(x, y, z, v);
        },
      );
    });

    const { exports, mem } = await instantiate(binary);
    const view = new Uint8Array(mem!.buffer);

    // (2, 1, 0) -> addr = 2 + 1*4 + 0*12 = 6
    exports.store3d(2, 1, 0, 42);
    expect(view[6]).toBe(42);

    // (0, 0, 1) -> addr = 0 + 0*4 + 1*12 = 12
    exports.store3d(0, 0, 1, 99);
    expect(view[12]).toBe(99);

    // (3, 2, 1) -> addr = 3 + 2*4 + 1*12 = 23
    exports.store3d(3, 2, 1, 77);
    expect(view[23]).toBe(77);
  });

  test("non-zero base offset", async () => {
    const OFFSET = 100;
    const binary = compile<{
      store3d(x: number, y: number, z: number, v: number): void;
      load3d(x: number, y: number, z: number): number;
    }>(function* () {
      yield* Mod.memory(1);
      const grid = Mem.byteGrid3D(OFFSET, X_SIZE, Y_SIZE);

      yield* Mod.exportFunc(
        "store3d",
        { x: "i32", y: "i32", z: "i32", v: "i32" },
        function* (x, y, z, v) {
          yield* grid.store(x, y, z, v);
        },
      );

      yield* Mod.exportFunc(
        "load3d",
        { x: "i32", y: "i32", z: "i32" },
        function* (x, y, z) {
          return yield* grid.load(x, y, z);
        },
      );
    });

    const { exports, mem } = await instantiate(binary);
    exports.store3d(1, 1, 1, 55);
    expect(exports.load3d(1, 1, 1)).toBe(55);

    // addr = 1 + 1*4 + 1*12 + 100 = 117
    const view = new Uint8Array(mem!.buffer);
    expect(view[117]).toBe(55);
  });

  test("at() returns FieldAccessor with set/incrBy", async () => {
    const binary = compile<{
      run(): number;
    }>(function* () {
      yield* Mod.memory(1);
      const grid = Mem.byteGrid3D(BASE, X_SIZE, Y_SIZE);

      yield* Mod.exportFunc("run", function* () {
        const x = yield* local(Type.i32, 1);
        const y = yield* local(Type.i32, 2);
        const z = yield* local(Type.i32, 0);
        // FieldAccessor is single-use, so get a fresh one each time
        yield* grid.at(x, y, z).set(10);
        yield* grid.at(x, y, z).incrBy(5);
        return yield* grid.load(x, y, z);
      });
    });

    const { exports } = await instantiate(binary);
    expect(exports.run()).toBe(15);
  });
});
