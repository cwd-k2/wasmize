import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { param, local, Type, Mod, Mem, Ctrl } from "../primitives";
import { instantiate } from "../../test-helpers";
import {
  intercept,
  interceptIR,
  withTrace,
  interceptModule,
  composeIntercepts,
  interceptFilter,
  interceptWhen,
} from "../intercept";
import type { TraceEntry } from "../intercept";
import { IR } from "../../wasm/ir";

describe("intercept", () => {
  test("identity intercept produces identical Wasm", async () => {
    const program = function* () {
      const fn = yield* Mod.func(function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* a.add(b);
      });
      yield* Mod.export("add", fn);
    };

    const identityProgram = function* () {
      const fn = yield* Mod.func(function* () {
        return yield* intercept(
          (function* () {
            const a = yield* param(Type.i32);
            const b = yield* param(Type.i32);
            return yield* a.add(b);
          })(),
          (instr) => instr,
        );
      });
      yield* Mod.export("add", fn);
    };

    const original = compile(program);
    const intercepted = compile(identityProgram);

    // Binary output should be identical
    expect(Array.from(intercepted)).toEqual(Array.from(original));
  });

  test("response forwarding preserves param/local declarations", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* intercept(
          (function* () {
            const a = yield* param(Type.i32);
            const b = yield* param(Type.i32);
            const sum = yield* local(Type.i32);
            yield* sum.set(yield* a.add(b));
            return sum;
          })(),
          (instr) => instr,
        );
      });
      yield* Mod.export("add", fn);
    });

    const {
      exports: { add },
    } = await instantiate(binary);
    expect((add as Function)(10, 32)).toBe(42);
  });

  test("response forwarding preserves valued if", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* intercept(
          (function* () {
            const x = yield* param(Type.i32);
            return yield* Ctrl.if(x)
              .then(function* () {
                return yield* Mem.i32(1);
              })
              .else(function* () {
                return yield* Mem.i32(0);
              });
          })(),
          (instr) => instr,
        );
      });
      yield* Mod.export("test", fn);
    });

    const {
      exports: { test: testFn },
    } = await instantiate(binary);
    expect((testFn as Function)(5)).toBe(1);
    expect((testFn as Function)(0)).toBe(0);
  });
});

describe("interceptIR", () => {
  test("transforms const values in stmt instructions", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* local(Type.i32);
        yield* interceptIR(
          (function* () {
            yield* x.set(yield* Mem.i32(10));
          })(),
          (node) => {
            // Recurse into local_set to replace const 10 with 42
            if (node.op === "local_set" && node.val.op === "const_i32" && node.val.v === 10) {
              return { ...node, val: IR.const_i32(42) };
            }
            return node;
          },
        );
        return x;
      });
      yield* Mod.export("test", fn);
    });

    const {
      exports: { test: testFn },
    } = await instantiate(binary);
    expect((testFn as Function)()).toBe(42);
  });

  test("does not affect non-stmt instructions", async () => {
    // interceptIR only transforms stmt instructions; decl passes through
    let transformCallCount = 0;
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* local(Type.i32);
        yield* interceptIR(
          (function* () {
            const a = yield* param(Type.i32);
            yield* x.set(yield* a.add(Mem.i32(1)));
          })(),
          (node) => {
            transformCallCount++;
            return node;
          },
        );
        return x;
      });
      yield* Mod.export("inc", fn);
    });

    const {
      exports: { inc },
    } = await instantiate(binary);
    expect((inc as Function)(5)).toBe(6);
    // The stmt (local_set) should be transformed; the decl (param) should not
    expect(transformCallCount).toBeGreaterThan(0);
  });
});

describe("withTrace", () => {
  test("collects trace entries without modifying output", async () => {
    const trace: TraceEntry[] = [];

    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* local(Type.i32);
        yield* withTrace(
          "myFunc",
          (function* () {
            const a = yield* param(Type.i32);
            const b = yield* param(Type.i32);
            yield* x.set(yield* a.add(b));
          })(),
          trace,
        );
        return x;
      });
      yield* Mod.export("add", fn);
    });

    // Verify trace was collected
    expect(trace.length).toBeGreaterThan(0);
    expect(trace.every((e) => e.label === "myFunc")).toBe(true);

    // Verify trace contains expected instruction types
    const types = trace.map((e) => e.instruction._type);
    expect(types).toContain("decl"); // params
    expect(types).toContain("stmt"); // the local_set

    // Verify the binary still works
    const {
      exports: { add },
    } = await instantiate(binary);
    expect((add as Function)(3, 4)).toBe(7);
  });

  test("trace entries have correct structure", () => {
    const trace: TraceEntry[] = [];

    compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* withTrace(
          "test",
          (function* () {
            const x = yield* param(Type.i32);
            return x;
          })(),
          trace,
        );
      });
      yield* Mod.export("f", fn);
    });

    expect(trace.length).toBe(1); // just the param decl
    expect(trace[0]!.label).toBe("test");
    expect(trace[0]!.instruction._type).toBe("decl");
    if (trace[0]!.instruction._type === "decl") {
      expect(trace[0]!.instruction.kind).toBe("param");
      expect(trace[0]!.instruction.valType).toBe("i32");
    }
  });
});

describe("interceptModule", () => {
  test("transforms module-level instructions", async () => {
    const exportNames: string[] = [];

    const innerProgram = function* () {
      yield* Mod.memory(1);
      const fn = yield* Mod.func(function* () {
        return yield* Mem.i32(42);
      });
      yield* Mod.export("original", fn);
    };

    const binary = compile(function* () {
      yield* interceptModule(innerProgram(), (instr) => {
        if (instr._type === "export") {
          exportNames.push(instr.name);
          return { ...instr, name: "renamed_" + instr.name };
        }
        return instr;
      });
    });

    expect(exportNames).toEqual(["original"]);

    const { exports } = await instantiate(binary);
    expect((exports as any).renamed_original()).toBe(42);
    expect((exports as any).original).toBeUndefined();
  });

  test("identity interceptModule preserves behavior", async () => {
    const binary = compile(function* () {
      yield* interceptModule(
        (function* () {
          yield* Mod.memory(1);
          const fn = yield* Mod.func(function* () {
            const x = yield* param(Type.i32);
            return yield* x.mul(3);
          });
          yield* Mod.export("triple", fn);
        })(),
        (instr) => instr,
      );
    });

    const {
      exports: { triple },
    } = await instantiate(binary);
    expect((triple as Function)(7)).toBe(21);
  });
});

describe("composeIntercepts", () => {
  test("chains multiple transforms left to right", async () => {
    const log: string[] = [];

    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* composeIntercepts(
          (function* () {
            const a = yield* param(Type.i32);
            return a;
          })(),
          (instr) => {
            log.push("t1");
            return instr;
          },
          (instr) => {
            log.push("t2");
            return instr;
          },
        );
      });
      yield* Mod.export("f", fn);
    });

    const {
      exports: { f },
    } = await instantiate(binary);
    expect((f as Function)(42)).toBe(42);
    // Both transforms applied to the decl instruction
    expect(log).toContain("t1");
    expect(log).toContain("t2");
  });
});

describe("interceptFilter", () => {
  test("drops matching stmt instructions", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* local(Type.i32);
        yield* interceptFilter(
          (function* () {
            // This store should be dropped
            yield* Mem.store(0, Mem.i32(99));
            // This set should remain
            yield* x.set(yield* Mem.i32(42));
          })(),
          (instr) => {
            if (instr._type === "stmt" && instr.node.op === "store_i32") return true;
            return false;
          },
        );
        return x;
      });
      yield* Mod.export("f", fn);
    });

    const {
      exports: { f },
    } = await instantiate(binary);
    expect((f as Function)()).toBe(42);
  });

  test("never drops decl instructions", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        return yield* interceptFilter(
          (function* () {
            const a = yield* param(Type.i32);
            return a;
          })(),
          () => true, // try to drop everything
        );
      });
      yield* Mod.export("f", fn);
    });

    const {
      exports: { f },
    } = await instantiate(binary);
    // Param decl survived even though shouldDrop returns true for all
    expect((f as Function)(7)).toBe(7);
  });
});

describe("interceptWhen", () => {
  test("applies transform only when predicate matches", async () => {
    const binary = compile(function* () {
      const fn = yield* Mod.func(function* () {
        const x = yield* local(Type.i32);
        yield* interceptWhen(
          (function* () {
            yield* x.set(yield* Mem.i32(10));
          })(),
          (instr) => instr._type === "stmt",
          (instr) => {
            if (
              instr._type === "stmt" &&
              instr.node.op === "local_set" &&
              instr.node.val.op === "const_i32" &&
              instr.node.val.v === 10
            ) {
              return { ...instr, node: { ...instr.node, val: IR.const_i32(20) } };
            }
            return instr;
          },
        );
        return x;
      });
      yield* Mod.export("f", fn);
    });

    const {
      exports: { f },
    } = await instantiate(binary);
    expect((f as Function)()).toBe(20);
  });
});
