import { describe, test, expect } from "vitest";
import { compile } from "../../dsl/compiler";
import { Type, Mod, Mem } from "../../dsl/primitives";
import { instantiate } from "../../runtime/instantiate";
import { memcpy, memset, memcmp } from "../mem";

describe("stdlib/mem", () => {
  test("memcpy copies bytes correctly", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const copy = yield* Mod.use(memcpy);

      yield* Mod.exportFunc("run", function* () {
        // Write test data at offset 0: [10, 20, 30, 40]
        yield* Mem.store8(0, 10);
        yield* Mem.store8(1, 20);
        yield* Mem.store8(2, 30);
        yield* Mem.store8(3, 40);
        // Copy 4 bytes from offset 0 to offset 100
        yield* copy.void(100, 0, 4);
      });

      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });

    const { exports } = await instantiate(binary);
    const run = exports.run as Function;
    const read = exports.read as Function;

    run();
    expect(read(100)).toBe(10);
    expect(read(101)).toBe(20);
    expect(read(102)).toBe(30);
    expect(read(103)).toBe(40);
  });

  test("memset fills bytes correctly", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const fill = yield* Mod.use(memset);

      yield* Mod.exportFunc("run", function* () {
        yield* fill.void(0, 0xff, 8);
      });

      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load8(addr);
      });
    });

    const { exports } = await instantiate(binary);
    const run = exports.run as Function;
    const read = exports.read as Function;

    run();
    for (let i = 0; i < 8; i++) {
      expect(read(i)).toBe(0xff);
    }
    // Beyond the fill range
    expect(read(8)).toBe(0);
  });

  test("memcmp returns 0 for equal regions", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const cmp = yield* Mod.use(memcmp);

      yield* Mod.exportFunc("setup", function* () {
        yield* Mem.store8(0, 1);
        yield* Mem.store8(1, 2);
        yield* Mem.store8(2, 3);
        yield* Mem.store8(100, 1);
        yield* Mem.store8(101, 2);
        yield* Mem.store8(102, 3);
      });

      yield* Mod.exportFunc(
        "compare",
        { a: Type.i32, b: Type.i32, len: Type.i32 },
        function* (a, b, len) {
          return yield* cmp(a, b, len);
        },
      );
    });

    const { exports } = await instantiate(binary);
    const setup = exports.setup as Function;
    const compare = exports.compare as Function;

    setup();
    expect(compare(0, 100, 3)).toBe(0);
  });

  test("memcmp returns negative when a < b", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const cmp = yield* Mod.use(memcmp);

      yield* Mod.exportFunc("setup", function* () {
        yield* Mem.store8(0, 1);
        yield* Mem.store8(1, 2);
        yield* Mem.store8(100, 1);
        yield* Mem.store8(101, 5);
      });

      yield* Mod.exportFunc(
        "compare",
        { a: Type.i32, b: Type.i32, len: Type.i32 },
        function* (a, b, len) {
          return yield* cmp(a, b, len);
        },
      );
    });

    const { exports } = await instantiate(binary);
    const setup = exports.setup as Function;
    const compare = exports.compare as Function;

    setup();
    expect(compare(0, 100, 2)).toBeLessThan(0);
  });

  test("memcmp returns positive when a > b", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      const cmp = yield* Mod.use(memcmp);

      yield* Mod.exportFunc("setup", function* () {
        yield* Mem.store8(0, 9);
        yield* Mem.store8(100, 1);
      });

      yield* Mod.exportFunc(
        "compare",
        { a: Type.i32, b: Type.i32, len: Type.i32 },
        function* (a, b, len) {
          return yield* cmp(a, b, len);
        },
      );
    });

    const { exports } = await instantiate(binary);
    const setup = exports.setup as Function;
    const compare = exports.compare as Function;

    setup();
    expect(compare(0, 100, 1)).toBeGreaterThan(0);
  });
});
