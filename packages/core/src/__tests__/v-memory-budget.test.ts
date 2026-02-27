import { describe, test, expect } from "vitest";
import { compile, compileWithDiagnostics, Mod } from "../dsl/compiler";
import { BumpAllocator } from "../dsl/allocator";
import { instantiate } from "../runtime/instantiate";

describe("V-01: Memory budget validation", () => {
  test("insufficient pages throws CompileError", () => {
    const alloc = Mod.allocator();
    // Allocate 2 pages worth of data (> 65536 bytes)
    alloc.alloc(65537);
    expect(alloc.requiredPages).toBe(2);

    expect(() =>
      compile(
        function* () {
          yield* Mod.memory(1); // Only 1 page declared
          yield* Mod.exportFunc("noop", function* () {
            return 0;
          });
        },
        { allocator: alloc },
      ),
    ).toThrow(
      "Memory budget exceeded: allocations require 2 pages but only 1 pages declared",
    );
  });

  test("auto-page calculation when memory() omitted", async () => {
    const alloc = Mod.allocator();
    alloc.alloc(65537); // requires 2 pages
    expect(alloc.requiredPages).toBe(2);

    const binary = compile<{ check(): number }>(
      function* () {
        // No Mod.memory() call — should auto-adopt allocator's requiredPages
        yield* Mod.exportFunc("check", function* () {
          return 42;
        });
      },
      { allocator: alloc },
    );

    const { exports } = await instantiate(binary);
    expect(exports.check()).toBe(42);
  });

  test("data segment exceeding bounds throws error", () => {
    expect(() =>
      compile(
        function* () {
          yield* Mod.memory(1); // 1 page = 65536 bytes
          yield* Mod.data(65500, new Uint8Array(100)); // 65500 + 100 = 65600 > 65536
          yield* Mod.exportFunc("noop", function* () {
            return 0;
          });
        },
      ),
    ).toThrow("Data segment out of bounds");
  });

  test("sufficient pages passes normally", async () => {
    const alloc = Mod.allocator();
    const arr = alloc.i32Array(4);

    const binary = compile<{ run(): number }>(
      function* () {
        yield* Mod.memory(alloc.requiredPages);
        yield* Mod.exportFunc("run", function* () {
          yield* arr.store(0, 99);
          return yield* arr.load(0);
        });
      },
      { allocator: alloc },
    );

    const { exports } = await instantiate(binary);
    expect(exports.run()).toBe(99);
  });

  test("multiple allocators - max required pages used", () => {
    const alloc1 = new BumpAllocator();
    alloc1.alloc(65537); // 2 pages
    const alloc2 = new BumpAllocator();
    alloc2.alloc(65536 * 3 + 1); // 4 pages

    expect(() =>
      compile(
        function* () {
          yield* Mod.memory(2); // Only 2 pages, but alloc2 needs 4
          yield* Mod.exportFunc("noop", function* () {
            return 0;
          });
        },
        { allocator: [alloc1, alloc2] },
      ),
    ).toThrow(
      "Memory budget exceeded: allocations require 4 pages but only 2 pages declared",
    );
  });

  test("data segment within bounds passes normally", async () => {
    const binary = compile<{ noop(): number }>(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(0, new Uint8Array([1, 2, 3, 4]));
      yield* Mod.exportFunc("noop", function* () {
        return 0;
      });
    });

    const { exports } = await instantiate(binary);
    expect(exports.noop()).toBe(0);
  });

  test("diagnostics mode collects error instead of throwing", () => {
    const alloc = Mod.allocator();
    alloc.alloc(65537); // 2 pages required

    const result = compileWithDiagnostics(
      function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("noop", function* () {
          return 0;
        });
      },
      { allocator: alloc },
    );

    expect(result.binary).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    const err = result.diagnostics.find((d) => d.code === "V-01");
    expect(err).toBeDefined();
    expect(err!.level).toBe("error");
    expect(err!.message).toContain("Memory budget exceeded");
  });

  test("diagnostics mode collects data segment error", () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.memory(1);
      yield* Mod.data(65500, new Uint8Array(100));
      yield* Mod.exportFunc("noop", function* () {
        return 0;
      });
    });

    expect(result.binary).toBeUndefined();
    const err = result.diagnostics.find(
      (d) => d.code === "V-01" && d.message.includes("Data segment"),
    );
    expect(err).toBeDefined();
    expect(err!.level).toBe("error");
  });
});
