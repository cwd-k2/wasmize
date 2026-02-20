import { describe, test, expect } from "vitest";
import { compile } from "../compiler";
import { Type, Mod, Mem, Op } from "../primitives";
import { instantiate } from "../../test-helpers";

describe("Mod.importGroup", () => {
  test("imports multiple functions from a single module", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const env = yield* Mod.importGroup("env", {
        add: { params: ["i32", "i32"], results: ["i32"] },
        mul: { params: ["i32", "i32"], results: ["i32"] },
      });

      yield* Mod.exportFunc("compute", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        // add(a, b) + mul(a, b)
        return yield* Op.add(env.add(a, b), env.mul(a, b));
      });
    });

    const { exports } = await instantiate(binary, {
      env: {
        add: (a: number, b: number) => a + b,
        mul: (a: number, b: number) => a * b,
      },
    });

    const compute = exports.compute as Function;
    // add(3, 4) + mul(3, 4) = 7 + 12 = 19
    expect(compute(3, 4)).toBe(19);
  });

  test("imported void functions work via .void()", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const env = yield* Mod.importGroup("env", {
        log: { params: ["i32"], results: [] },
      });

      yield* Mod.exportFunc("run", { v: Type.i32 }, function* (v) {
        yield* env.log.void(v);
        // Store a marker so we can verify the function ran
        yield* Mem.store(0, v);
      });

      yield* Mod.exportFunc("read", function* () {
        return yield* Mem.load(0);
      });
    });

    let loggedValue = -1;
    const { exports } = await instantiate(binary, {
      env: {
        log: (v: number) => {
          loggedValue = v;
        },
      },
    });

    const run = exports.run as Function;
    const read = exports.read as Function;

    run(42);
    expect(loggedValue).toBe(42);
    expect(read()).toBe(42);
  });
});
