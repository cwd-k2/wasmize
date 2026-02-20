import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod } from "../dsl/primitives";
import { WorkerPool } from "../runtime/worker-pool";

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

describe("WorkerPool dedup", () => {
  test("dedup: same call returns same promise", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("double", { x: Type.i32 }, function* (x) {
        return yield* x.mul(2);
      });
    });

    const pool = new WorkerPool(binary, { workers: 1, dedup: true });
    try {
      // Fire two identical calls simultaneously
      const p1 = pool.run("double" as any, 21);
      const p2 = pool.run("double" as any, 21);
      // They should share the same promise
      expect(p1).toBe(p2);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(42);
      expect(r2).toBe(42);
    } finally {
      pool.terminate();
    }
  });

  test("dedup: different args dispatch separately", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("double", { x: Type.i32 }, function* (x) {
        return yield* x.mul(2);
      });
    });

    const pool = new WorkerPool(binary, { workers: 2, dedup: true });
    try {
      const p1 = pool.run("double" as any, 10);
      const p2 = pool.run("double" as any, 20);
      // Different args → different promises
      expect(p1).not.toBe(p2);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(20);
      expect(r2).toBe(40);
    } finally {
      pool.terminate();
    }
  });

  test("dedup: completed task re-executes on next call", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("double", { x: Type.i32 }, function* (x) {
        return yield* x.mul(2);
      });
    });

    const pool = new WorkerPool(binary, { workers: 1, dedup: true });
    try {
      const r1 = await pool.run("double" as any, 5);
      expect(r1).toBe(10);
      // After completion, same call should re-execute (not return stale)
      const r2 = await pool.run("double" as any, 5);
      expect(r2).toBe(10);
    } finally {
      pool.terminate();
    }
  });
});
