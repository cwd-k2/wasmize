import { describe, test, expect } from "vitest";
import { compile, locals, run, Mod, Type } from "../dsl/compiler";
import { instantiate } from "../runtime/instantiate";

describe("locals (batch declaration)", () => {
  test("declares multiple i32 locals", async () => {
    const binary = compile<{ calc(): number }>(function* () {
      yield* Mod.exportFunc("calc", {}, function* () {
        const [a, b, c] = yield* locals(
          [Type.i32, 1],
          [Type.i32, 2],
          [Type.i32, 3],
        );

        yield* run(() => [
          a.incrBy(1),
          b.decrBy(2),
          c.incrBy(a.add(b).add(c).add(1)),
        ]);

        return yield* a.add(b).add(c);
      });
    });
    const { exports } = await instantiate(binary);
    expect(exports.calc()).toBe(11);
  });
});
