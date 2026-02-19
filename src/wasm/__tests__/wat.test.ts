import { describe, test, expect } from "vitest";
import { compileToIR } from "../../dsl/interpreter";
import { moduleToWAT } from "../wat";
import { Type, Mod, Ctrl, local } from "../../dsl/primitives";

describe("WAT output", () => {
  test("simple add function", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("(module");
    expect(wat).toContain('(export "add")');
    expect(wat).toContain("i32.add");
    expect(wat).toContain("(param $p0 i32)");
    expect(wat).toContain("(param $p1 i32)");
    expect(wat).toContain("(result i32)");
  });

  test("memory declaration", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.memory(2);
      yield* Mod.exportFunc("noop", function* () {});
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("(memory");
    expect(wat).toContain("2)");
  });

  test("local variables", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.exportFunc("test", function* () {
        const x = yield* local(Type.i32, 42);
        return x;
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("(local");
    expect(wat).toContain("local.set");
    expect(wat).toContain("i32.const 42");
  });

  test("if/else", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.exportFunc("test", { n: Type.i32 }, function* (n) {
        return yield* Ctrl.if(n.gt(0))
          .then(function* () { return 1; })
          .else(function* () { return 0; });
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("if (result i32)");
    expect(wat).toContain("else");
    expect(wat).toContain("end");
  });

  test("loop", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.exportFunc("test", { n: Type.i32 }, function* (n) {
        const i = yield* local(Type.i32);
        yield* Ctrl.while(i.lt(n), function* () {
          yield* i.incrBy(1);
        });
        return i;
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("block");
    expect(wat).toContain("loop");
    expect(wat).toContain("br_if");
    expect(wat).toContain("br 0");
  });

  test("data segment", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([0x48, 0x65, 0x6c]));
      yield* Mod.exportFunc("noop", function* () {});
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("(data (i32.const 0)");
    expect(wat).toContain("\\48\\65\\6c");
  });

  test("global variable", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      const g = yield* Mod.global(Type.i32, 0);
      yield* Mod.exportFunc("inc", function* () {
        yield* g.set(g.get().add(1));
        return yield* g.get();
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat).toContain("(global (mut i32)");
    expect(wat).toContain("global.get");
    expect(wat).toContain("global.set");
  });

  test("WAT is well-formed (ends with closing paren)", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      yield* Mod.exportFunc("id", { n: Type.i32 }, function* (n) {
        return n;
      });
    });
    const wat = moduleToWAT(funcs, moduleOptions);
    expect(wat.startsWith("(module")).toBe(true);
    expect(wat.endsWith(")")).toBe(true);
  });
});
