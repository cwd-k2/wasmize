import { describe, test, expect } from "vitest";
import { inspectIR, compileWithMetadata } from "../debug";
import { Type, Mod } from "../dsl/primitives";

describe("inspectIR", () => {
  test("returns function IR metadata", () => {
    const result = inspectIR(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });

    expect(result.funcs).toHaveLength(1);
    expect(result.funcs[0]!.name).toBe("add");
    expect(result.funcs[0]!.params).toEqual(["i32", "i32"]);
    expect(result.funcs[0]!.results).toEqual(["i32"]);
    expect(result.funcs[0]!.body.length).toBeGreaterThan(0);
  });

  test("returns exports", () => {
    const result = inspectIR(function* () {
      yield* Mod.exportFunc("foo", function* () { return 42; });
      yield* Mod.exportFunc("bar", function* () { return 0; });
    });
    expect(result.exports).toHaveLength(2);
    expect(result.exports[0]!.name).toBe("foo");
    expect(result.exports[1]!.name).toBe("bar");
  });

  test("returns memory pages", () => {
    const result = inspectIR(function* () {
      yield* Mod.memory(4);
      yield* Mod.exportFunc("noop", function* () {});
    });
    expect(result.memoryPages).toBe(4);
  });
});

describe("compileWithMetadata", () => {
  test("returns binary, IR, and WAT", () => {
    const result = compileWithMetadata(function* () {
      yield* Mod.exportFunc("id", { n: Type.i32 }, function* (n) {
        return n;
      });
    });

    expect(result.binary).toBeInstanceOf(Uint8Array);
    expect(result.binary.length).toBeGreaterThan(0);
    expect(result.ir.funcs).toHaveLength(1);
    expect(result.wat).toContain("(module");
    expect(result.wat).toContain('(export "id")');
  });
});
