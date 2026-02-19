import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Mem } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("call_indirect", () => {
  test("dynamic dispatch via function table", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      // Two functions with same signature: (i32, i32) -> i32
      const addFn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      const mulFn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.mul(b);
      });

      // Create a table with both functions
      const table = yield* Mod.table([addFn, mulFn]);

      // Export a function that dispatches via the table
      yield* Mod.exportFunc(
        "dispatch",
        { op: Type.i32, a: Type.i32, b: Type.i32 },
        function* (op, a, b) {
          return yield* table.call(op, a, b);
        },
      );
    });

    const { exports: { dispatch } } = await instantiate(binary);
    const fn = dispatch as Function;
    expect(fn(0, 3, 4)).toBe(7);
    expect(fn(1, 3, 4)).toBe(12);
  });

  test("callVoid for void-returning dispatch", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const storeAt0 = yield* Mod.func({ val: Type.i32 }, function* (val) {
        yield* Mem.store(0, val);
      });
      const storeAt4 = yield* Mod.func({ val: Type.i32 }, function* (val) {
        yield* Mem.store(4, val);
      });

      const table = yield* Mod.table([storeAt0, storeAt4]);

      yield* Mod.exportFunc(
        "run",
        { op: Type.i32, val: Type.i32 },
        function* (op, val) {
          yield* table.callVoid(op, val);
        },
      );

      yield* Mod.exportFunc("read", { addr: Type.i32 }, function* (addr) {
        return yield* Mem.load(addr);
      });
    });

    const { exports } = await instantiate(binary);
    const run = exports.run as Function;
    const read = exports.read as Function;

    run(0, 42);
    run(1, 99);
    expect(read(0)).toBe(42);
    expect(read(4)).toBe(99);
  });
});
