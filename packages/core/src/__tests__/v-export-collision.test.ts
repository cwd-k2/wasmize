import { describe, test, expect } from "vitest";
import { compile, Mod } from "../dsl/compiler";
import { instantiate } from "../runtime/instantiate";

describe("V-02: Export name collision detection", () => {
  test("duplicate export name throws CompileError", () => {
    expect(() =>
      compile(function* () {
        const f1 = yield* Mod.func(function* () {
          return 1;
        });
        const f2 = yield* Mod.func(function* () {
          return 2;
        });
        yield* Mod.export("add", f1);
        yield* Mod.export("add", f2);
      }),
    ).toThrow("Duplicate export name: 'add'");
  });

  test("different export names pass normally", async () => {
    const binary = compile<{ a(): number; b(): number }>(function* () {
      yield* Mod.exportFunc("a", {}, function* () {
        return 1;
      });
      yield* Mod.exportFunc("b", {}, function* () {
        return 2;
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.a()).toBe(1);
    expect(exports.b()).toBe(2);
  });

  test("exportAll with duplicate names throws CompileError", () => {
    expect(() =>
      compile(function* () {
        const f1 = yield* Mod.func(function* () {
          return 1;
        });
        const f2 = yield* Mod.func(function* () {
          return 2;
        });
        yield* Mod.exportAll({ add: f1 });
        yield* Mod.exportAll({ add: f2 });
      }),
    ).toThrow("Duplicate export name: 'add'");
  });

  test("exportFunc with duplicate name throws CompileError", () => {
    expect(() =>
      compile(function* () {
        yield* Mod.exportFunc("calc", {}, function* () {
          return 1;
        });
        yield* Mod.exportFunc("calc", {}, function* () {
          return 2;
        });
      }),
    ).toThrow("Duplicate export name: 'calc'");
  });
});
