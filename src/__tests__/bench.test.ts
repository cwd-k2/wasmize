import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod, Mem, Ctrl, local } from "../dsl/primitives";
import { bench } from "../bench";

describe("bench harness", () => {
  test("benchmarks a Wasm function and returns stats", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("sum", { n: Type.i32 }, function* (n) {
        const acc = yield* local(Type.i32);
        const i = yield* local(Type.i32);
        yield* Ctrl.while(i.lt(n), () => [
          acc.incrBy(Mem.i32Array().load(i)),
          i.incrBy(1),
        ]);
        return acc;
      });
    });

    const result = await bench(binary, "sum" as any, (mem) => {
      for (let i = 0; i < 100; i++) mem[i] = i + 1;
      return [100];
    }, { warmup: 5, iterations: 20 });

    expect(result.wasm.mean).toBeGreaterThan(0);
    expect(result.wasm.median).toBeGreaterThan(0);
    expect(result.wasm.stddev).toBeGreaterThanOrEqual(0);
    expect(result.js).toBeUndefined();
    expect(result.speedup).toBeUndefined();
  });

  test("compares Wasm with JS baseline", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("sum", { n: Type.i32 }, function* (n) {
        const acc = yield* local(Type.i32);
        const i = yield* local(Type.i32);
        yield* Ctrl.while(i.lt(n), () => [
          acc.incrBy(Mem.i32Array().load(i)),
          i.incrBy(1),
        ]);
        return acc;
      });
    });

    const result = await bench(binary, "sum" as any, (mem) => {
      for (let i = 0; i < 100; i++) mem[i] = i + 1;
      return [100];
    }, {
      warmup: 5,
      iterations: 20,
      baseline: (n: number) => {
        let sum = 0;
        for (let i = 0; i < n; i++) sum += i + 1;
        return sum;
      },
    });

    expect(result.wasm.mean).toBeGreaterThan(0);
    expect(result.js).toBeDefined();
    expect(result.js!.mean).toBeGreaterThan(0);
    expect(typeof result.speedup).toBe("number");
    expect(result.speedup).toBeGreaterThan(0);
  });
});
