import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod } from "../dsl/primitives";
import { WorkerPool } from "../worker-pool";

describe("WorkerPool", () => {
  test("runs a function on a single worker", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("double", { x: Type.i32 }, function* (x) {
        return yield* x.mul(2);
      });
    });

    const pool = new WorkerPool(binary, { workers: 1 });
    try {
      const result = await pool.run("double" as any, 21);
      expect(result).toBe(42);
    } finally {
      pool.terminate();
    }
  });

  test("runs multiple tasks in parallel", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("square", { x: Type.i32 }, function* (x) {
        return yield* x.mul(x);
      });
    });

    const pool = new WorkerPool(binary, { workers: 4 });
    try {
      const results = await Promise.all(
        [1, 2, 3, 4, 5, 6, 7, 8].map((n) => pool.run("square" as any, n)),
      );
      expect(results).toEqual([1, 4, 9, 16, 25, 36, 49, 64]);
    } finally {
      pool.terminate();
    }
  });

  test("queues tasks when all workers are busy", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });

    const pool = new WorkerPool(binary, { workers: 2 });
    try {
      // Submit more tasks than workers
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => pool.run("add" as any, i, 100)),
      );
      expect(results).toEqual(Array.from({ length: 10 }, (_, i) => i + 100));
    } finally {
      pool.terminate();
    }
  });
});
