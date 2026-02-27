import { describe, test, expect } from "vitest";
import { compile, Mod, Type, Loc } from "../dsl/compiler";
import { instantiate } from "../runtime/instantiate";

describe("V-03: Function call arity check", () => {
  test("Mod.func: too many arguments throws Error", () => {
    expect(() =>
      compile(function* () {
        const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
        yield* Mod.exportFunc("main", function* () {
          return yield* add(...([1, 2, 3] as any));
        });
      }),
    ).toThrow("Function '<func#0>' expects 2 arguments but got 3");
  });

  test("Mod.func: too few arguments throws Error", () => {
    expect(() =>
      compile(function* () {
        const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
        yield* Mod.exportFunc("main", function* () {
          return yield* add(...([1] as any));
        });
      }),
    ).toThrow("Function '<func#0>' expects 2 arguments but got 1");
  });

  test("Mod.func: correct argument count passes normally", async () => {
    const binary = compile<{ main(): number }>(function* () {
      const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      yield* Mod.exportFunc("main", function* () {
        return yield* add(10, 20);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.main()).toBe(30);
  });

  test("Mod.exportFunc: too many arguments throws with function name", () => {
    expect(() =>
      compile(function* () {
        const add = yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
        yield* Mod.exportFunc("main", function* () {
          return yield* add(...([1, 2, 3] as any));
        });
      }),
    ).toThrow("Function 'add' expects 2 arguments but got 3");
  });

  test("Mod.exportFunc: too few arguments throws with function name", () => {
    expect(() =>
      compile(function* () {
        const add = yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
          return yield* a.add(b);
        });
        yield* Mod.exportFunc("main", function* () {
          return yield* add(...([1] as any));
        });
      }),
    ).toThrow("Function 'add' expects 2 arguments but got 1");
  });

  test("void call with wrong arity throws Error", () => {
    expect(() =>
      compile(function* () {
        const store = yield* Mod.func({ addr: Type.i32, val: Type.i32 }, function* (addr, v) {
          yield* Loc.set(addr, v);
        });
        yield* Mod.exportFunc("main", function* () {
          yield* store.void(...([1] as any));
          return 0;
        });
      }),
    ).toThrow("expects 2 arguments but got 1");
  });

  test("zero-param function called with arguments throws Error", () => {
    expect(() =>
      compile(function* () {
        const getConst = yield* Mod.func({}, function* () {
          return 42;
        });
        yield* Mod.exportFunc("main", function* () {
          return yield* getConst(...([1] as any));
        });
      }),
    ).toThrow("expects 0 arguments but got 1");
  });

  test("imported function arity check", () => {
    expect(() =>
      compile(function* () {
        const log = yield* Mod.import("env", "log", [Type.i32], []);
        yield* Mod.exportFunc("main", function* () {
          yield* log.void(...([1, 2] as any));
          return 0;
        });
      }),
    ).toThrow("Function 'log' expects 1 arguments but got 2");
  });
});
