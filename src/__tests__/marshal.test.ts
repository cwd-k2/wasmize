import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod, Mem } from "../dsl/primitives";
import { instantiate } from "../test-helpers";
import {
  writeI32Array,
  readI32Array,
  writeF64Array,
  readF64Array,
  writeString,
  readString,
  roundtrip,
} from "../marshal";

describe("Marshal", () => {
  describe("i32 arrays", () => {
    test("writeI32Array and readI32Array", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        // No-op export just to instantiate
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { mem } = await instantiate(binary);
      const data = [10, 20, 30, 40, 50];
      writeI32Array(mem!, 0, data);
      expect(readI32Array(mem!, 0, 5)).toEqual(data);
    });

    test("writeI32Array at non-zero offset", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { mem } = await instantiate(binary);
      writeI32Array(mem!, 10, [100, 200]);
      expect(readI32Array(mem!, 10, 2)).toEqual([100, 200]);
      expect(mem![9]).toBe(0); // untouched
    });
  });

  describe("f64 arrays", () => {
    test("writeF64Array and readF64Array", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { bytes } = await instantiate(binary);
      const data = [1.5, 2.7, 3.14];
      writeF64Array(bytes!, 0, data);
      const result = readF64Array(bytes!, 0, 3);
      expect(result[0]).toBeCloseTo(1.5);
      expect(result[1]).toBeCloseTo(2.7);
      expect(result[2]).toBeCloseTo(3.14);
    });
  });

  describe("strings", () => {
    test("writeString and readString", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { bytes } = await instantiate(binary);
      const written = writeString(bytes!, 0, "Hello");
      expect(written).toBe(5);
      expect(readString(bytes!, 0, 5)).toBe("Hello");
    });

    test("readString stops at null terminator", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { bytes } = await instantiate(binary);
      writeString(bytes!, 0, "Hi");
      bytes![2] = 0; // null terminator (already 0, but explicit)
      writeString(bytes!, 3, "World");
      expect(readString(bytes!, 0)).toBe("Hi");
    });

    test("readString with maxLen", async () => {
      const binary = compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {});
      });
      const { bytes } = await instantiate(binary);
      writeString(bytes!, 0, "Hello World");
      expect(readString(bytes!, 0, 5)).toBe("Hello");
    });
  });

  describe("roundtrip", () => {
    test("write input, run function, read output", async () => {
      // A simple Wasm function that doubles each element of an i32 array
      const binary = compile(function* () {
        yield* Mod.memory(1);
        const arr = Mem.i32Array(0);
        yield* Mod.exportFunc("double", { n: Type.i32 }, function* (n) {
          const i = yield* local(Type.i32);
          yield* Ctrl.for(i, 0, i.lt(n), i.add(1), function* () {
            yield* arr.store(i, arr.load(i).mul(2));
          });
        });
      });

      const { result, outputs } = await roundtrip(
        binary,
        { arr: { type: "i32", offset: 0, count: 4 } },
        { arr: [1, 2, 3, 4] },
        (exp) => (exp.double as Function)(4),
      );
      expect(result).toBeUndefined();
      expect(outputs.arr).toEqual([2, 4, 6, 8]);
    });
  });
});

// Needed by the roundtrip test
import { local, Ctrl } from "../dsl/primitives";
