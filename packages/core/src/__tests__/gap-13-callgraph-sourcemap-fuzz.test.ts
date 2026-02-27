import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Ctrl, Type, Loc, Mem } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";
import { buildCallGraph, findRecursion, findUnusedFunctions } from "../wasm/call-graph";
import { saveBenchmark, loadBenchmark, compareBenchmarks, type BenchmarkResult } from "../runtime/bench-history";
import { buildSourceMap, SourceMapCollector, compileWithSourceMap, type SourceMapEntry } from "../wasm/source-map";
import { Gen, fuzz } from "../runtime/fuzz";
import { compileToIR } from "../dsl/interpreter";
// @ts-expect-error -- node:fs has no type declarations in this project
import { unlinkSync, existsSync } from "node:fs";
// @ts-expect-error -- node:path has no type declarations in this project
import { join } from "node:path";
// @ts-expect-error -- node:os has no type declarations in this project
import { tmpdir } from "node:os";

// ============================================================
// T-02: Call Graph Analysis
// ============================================================
describe("T-02: Call Graph Analysis", () => {
  test("builds call graph from functions with direct calls", () => {
    const { funcs } = compileToIR(function* () {
      // func 0: helper
      const helper = yield* Mod.func({ x: Type.i32 }, function* (x) {
        return yield* x.add(1);
      });
      // func 1: main, calls helper (func 0)
      yield* Mod.exportFunc("main", { n: Type.i32 }, function* (n) {
        return yield* helper(n);
      });
    });

    const graph = buildCallGraph(funcs);
    expect(graph.size).toBe(2);
    // func 1 (main) calls func 0 (helper)
    expect(graph.get(1)!.has(0)).toBe(true);
    // func 0 (helper) does not call anything
    expect(graph.get(0)!.size).toBe(0);
  });

  test("detects direct recursion", () => {
    const { funcs } = compileToIR(function* () {
      // A single recursive function
      const fib = yield* Mod.recursive({ n: Type.i32 }, function* (self, n) {
        const a = yield* local(Type.i32);
        const b = yield* local(Type.i32);
        return yield* Ctrl.if(n.le(1))
          .then(function* () { return n; })
          .else(function* () {
            yield* a.set(self(n.sub(1)));
            yield* b.set(self(n.sub(2)));
            return yield* a.add(b);
          });
      });
      yield* Mod.export("fib", fib);
    });

    const graph = buildCallGraph(funcs);
    const recursive = findRecursion(graph);
    // func 0 (fib) calls itself
    expect(recursive.has(0)).toBe(true);
  });

  test("detects mutual recursion via call graph", () => {
    const { funcs } = compileToIR(function* () {
      // func 0: helper calls func 1 (main)
      // func 1: main calls func 0 (helper)
      const helper = yield* Mod.func({ n: Type.i32 }, function* (n) {
        return yield* n.sub(1);
      });

      const main = yield* Mod.func({ n: Type.i32 }, function* (n) {
        return yield* Ctrl.if(n.eq(0))
          .then(function* () { return 0; })
          .else(function* () {
            return yield* helper(n.sub(1));
          });
      });

      yield* Mod.export("helper", helper);
      yield* Mod.export("main", main);
    });

    const graph = buildCallGraph(funcs);
    // main (func 1) calls helper (func 0)
    expect(graph.get(1)!.has(0)).toBe(true);
    // helper (func 0) does not call main
    expect(graph.get(0)!.has(1)).toBe(false);
  });

  test("finds unused functions", () => {
    const { funcs, moduleOptions } = compileToIR(function* () {
      // func 0: unused helper - never called
      yield* Mod.func(function* () {
        return 42;
      });

      // func 1: used helper
      const used = yield* Mod.func({ x: Type.i32 }, function* (x) {
        return yield* x.add(1);
      });

      // func 2: exported, calls func 1
      yield* Mod.exportFunc("main", { n: Type.i32 }, function* (n) {
        return yield* used(n);
      });
    });

    const graph = buildCallGraph(funcs);
    const exportIndices = (moduleOptions.exports ?? []).map((e) => e.idx);
    const unused = findUnusedFunctions(graph, exportIndices);

    // func 0 is unused (not called by any export)
    expect(unused.has(0)).toBe(true);
    // func 1 and func 2 should be reachable
    expect(unused.has(1)).toBe(false);
    expect(unused.has(2)).toBe(false);
  });
});

// ============================================================
// T-03: Performance Regression Tracking
// ============================================================
describe("T-03: Performance Regression Tracking", () => {
  const tmpFile = join(tmpdir(), `bench-history-test-${Date.now()}.json`);

  test("saves and loads benchmark results", () => {
    const result: BenchmarkResult = {
      name: "test-bench",
      opsPerSec: 1000000,
      meanMs: 0.001,
    };

    saveBenchmark("test-bench", result, tmpFile);
    const loaded = loadBenchmark(tmpFile);

    expect(loaded).toHaveLength(1);
    expect(loaded[0]!.name).toBe("test-bench");
    expect(loaded[0]!.opsPerSec).toBe(1000000);
    expect(loaded[0]!.meanMs).toBe(0.001);

    // Clean up
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  });

  test("appends to existing file", () => {
    const file2 = join(tmpdir(), `bench-history-test2-${Date.now()}.json`);
    const result1: BenchmarkResult = { name: "bench-a", opsPerSec: 100, meanMs: 10 };
    const result2: BenchmarkResult = { name: "bench-b", opsPerSec: 200, meanMs: 5 };

    saveBenchmark("bench-a", result1, file2);
    saveBenchmark("bench-b", result2, file2);

    const loaded = loadBenchmark(file2);
    expect(loaded).toHaveLength(2);
    expect(loaded[0]!.name).toBe("bench-a");
    expect(loaded[1]!.name).toBe("bench-b");

    // Clean up
    if (existsSync(file2)) unlinkSync(file2);
  });

  test("loadBenchmark returns empty array for missing file", () => {
    const loaded = loadBenchmark("/tmp/nonexistent-file-12345.json");
    expect(loaded).toEqual([]);
  });

  test("compares benchmarks for regression", () => {
    const baseline: BenchmarkResult = { name: "test", opsPerSec: 1000, meanMs: 1.0 };
    const faster: BenchmarkResult = { name: "test", opsPerSec: 2000, meanMs: 0.5 };
    const slower: BenchmarkResult = { name: "test", opsPerSec: 500, meanMs: 2.0 };
    const marginal: BenchmarkResult = { name: "test", opsPerSec: 950, meanMs: 1.05 };

    // Faster should not regress
    const r1 = compareBenchmarks(baseline, faster);
    expect(r1.regressed).toBe(false);
    expect(r1.ratio).toBeCloseTo(0.5);

    // 2x slower should regress (threshold 1.1)
    const r2 = compareBenchmarks(baseline, slower);
    expect(r2.regressed).toBe(true);
    expect(r2.ratio).toBeCloseTo(2.0);

    // 5% slower should not regress (under 10% threshold)
    const r3 = compareBenchmarks(baseline, marginal);
    expect(r3.regressed).toBe(false);

    // Custom threshold: 1.02 (2% regression)
    const r4 = compareBenchmarks(baseline, marginal, 1.02);
    expect(r4.regressed).toBe(true);
  });
});

// ============================================================
// T-05: Source Map / Debug Annotations
// ============================================================
describe("T-05: Source Map / Debug Annotations", () => {
  test("builds source map v3 JSON", () => {
    const entries: SourceMapEntry[] = [
      { generatedOffset: 0, originalLine: 1, originalColumn: 0, name: "add" },
      { generatedOffset: 5, originalLine: 2, originalColumn: 4 },
      { generatedOffset: 10, originalLine: 3, originalColumn: 8, name: "result" },
    ];

    const json = buildSourceMap(entries, "test.ts", "test.wasm");
    const map = JSON.parse(json);

    expect(map.version).toBe(3);
    expect(map.file).toBe("test.wasm");
    expect(map.sources).toEqual(["test.ts"]);
    expect(map.names).toEqual(["add", "result"]);
    expect(typeof map.mappings).toBe("string");
    expect(map.mappings.length).toBeGreaterThan(0);
  });

  test("SourceMapCollector accumulates entries", () => {
    const collector = new SourceMapCollector();
    collector.add({ generatedOffset: 0, originalLine: 1, originalColumn: 0 });
    collector.add({ generatedOffset: 5, originalLine: 2, originalColumn: 4 });

    expect(collector.entries).toHaveLength(2);

    const json = collector.build("source.ts");
    const map = JSON.parse(json);
    expect(map.version).toBe(3);
    expect(map.sources).toEqual(["source.ts"]);

    collector.clear();
    expect(collector.entries).toHaveLength(0);
  });

  test("compileWithSourceMap produces binary, sourceMap, and WAT", () => {
    const result = compileWithSourceMap(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    }, { sourceFile: "my-program.ts" });

    expect(result.binary).toBeInstanceOf(Uint8Array);
    expect(result.binary.length).toBeGreaterThan(0);

    expect(typeof result.wat).toBe("string");
    expect(result.wat).toContain("func");

    const map = JSON.parse(result.sourceMap);
    expect(map.version).toBe(3);
    expect(map.sources).toEqual(["my-program.ts"]);
  });
});

// ============================================================
// T-06: Fuzzing Framework
// ============================================================
describe("T-06: Fuzzing Framework", () => {
  test("Gen.i32 generates and shrinks", () => {
    const gen = Gen.i32();
    const shrunk = gen.shrink(100);
    expect(shrunk).toContain(0);
    expect(shrunk).toContain(50);
    expect(gen.shrink(0)).toHaveLength(0);
  });

  test("Gen.i32Range generates within bounds", () => {
    const gen = Gen.i32Range(10, 20);
    const shrunk = gen.shrink(15);
    expect(shrunk.every((v: number) => v >= 10 && v < 20)).toBe(true);
    expect(shrunk).toContain(10); // min value
  });

  test("Gen.f64 generates and shrinks floats", () => {
    const gen = Gen.f64();
    const shrunk = gen.shrink(100.5);
    expect(shrunk).toContain(0);
    expect(shrunk.some((v: number) => v !== 0)).toBe(true);
  });

  test("Gen.array generates and shrinks arrays", () => {
    const gen = Gen.array(Gen.i32(), 3);
    const shrunk = gen.shrink([100, 200, 300]);
    expect(shrunk.length).toBeGreaterThan(0);
    expect(shrunk[0]).toHaveLength(3);
  });

  test("fuzz catches a known-buggy function", async () => {
    // Compile a function that traps when b is 0 (div by zero)
    const binary = compile(function* () {
      yield* Mod.exportFunc("divide", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.div(b);
      });
    });

    const { exports } = await instantiate(binary);
    const divide = exports.divide as (a: number, b: number) => number;

    const result = fuzz(divide, {
      iterations: 100,
      seed: 42,
      generators: [Gen.i32Range(-10, 10), Gen.i32Range(-5, 5)],
    });

    // Should find failures when b is 0
    expect(result.failed).toBeGreaterThan(0);
    // Shrinking should find b=0 as the minimal failing case
    const hasZeroDivisor = result.failures.some((f) => f.input[1] === 0);
    expect(hasZeroDivisor).toBe(true);
  });

  test("fuzz with all-passing function reports no failures", () => {
    const fn = (a: number) => a + 1;
    const result = fuzz(fn, {
      iterations: 50,
      seed: 123,
      generators: [Gen.i32()],
    });

    expect(result.passed).toBe(50);
    expect(result.failed).toBe(0);
    expect(result.failures).toHaveLength(0);
  });
});

// ============================================================
// W-12: Multiple Tables
// ============================================================
describe("W-12: Multiple Tables", () => {
  test("single table with call_indirect works", async () => {
    const binary = compile(function* () {
      const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      const sub = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.sub(b);
      });

      const table = yield* Mod.table([add, sub]);

      yield* Mod.exportFunc("dispatch", { idx: Type.i32, a: Type.i32, b: Type.i32 }, function* (idx, a, b) {
        return yield* table.call(idx, a, b);
      });
    });

    const { exports } = await instantiate(binary);
    const dispatch = exports.dispatch as (idx: number, a: number, b: number) => number;
    expect(dispatch(0, 10, 3)).toBe(13);
    expect(dispatch(1, 10, 3)).toBe(7);
  });

  test("two tables with independent dispatch", async () => {
    const binary = compile(function* () {
      // Arithmetic functions
      const add = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
      const sub = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.sub(b);
      });

      // Comparison functions
      const maxFn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Ctrl.if(a.gt(b))
          .then(function* () { return yield* a.add(0); })
          .else(function* () { return yield* b.add(0); });
      });
      const minFn = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* Ctrl.if(a.lt(b))
          .then(function* () { return yield* a.add(0); })
          .else(function* () { return yield* b.add(0); });
      });

      const arithTable = yield* Mod.table([add, sub]);
      const cmpTable = yield* Mod.table([maxFn, minFn]);

      yield* Mod.exportFunc("arith", { idx: Type.i32, a: Type.i32, b: Type.i32 }, function* (idx, a, b) {
        return yield* arithTable.call(idx, a, b);
      });

      yield* Mod.exportFunc("cmp", { idx: Type.i32, a: Type.i32, b: Type.i32 }, function* (idx, a, b) {
        return yield* cmpTable.call(idx, a, b);
      });
    });

    const { exports } = await instantiate(binary);
    const arith = exports.arith as (idx: number, a: number, b: number) => number;
    const cmp = exports.cmp as (idx: number, a: number, b: number) => number;

    // Table 0: arithmetic
    expect(arith(0, 10, 3)).toBe(13);
    expect(arith(1, 10, 3)).toBe(7);

    // Table 1: comparison
    expect(cmp(0, 10, 3)).toBe(10);
    expect(cmp(1, 10, 3)).toBe(3);
  });
});

// ============================================================
// D-04: Array Body Value Return
// ============================================================
describe("D-04: Array Body Value Return", () => {
  test("if expression with array body returning a ChainableExpr", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("abs", { x: Type.i32 }, function* (x) {
        // Both branches return a value — generator form for then, array form for else
        const result = yield* Ctrl.if(x.ge(0))
          .then(function* () { return yield* x.add(0); })
          .else(() => [
            // D-04: last element is a ChainableExpr → treated as return value
            x.mul(-1),
          ]);
        return result;
      });
    });

    const { exports } = await instantiate(binary);
    const abs = exports.abs as (x: number) => number;
    expect(abs(5)).toBe(5);
    expect(abs(-3)).toBe(3);
    expect(abs(0)).toBe(0);
  });

  test("if expression with array body: statements + value return", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("compute", { x: Type.i32 }, function* (x) {
        const tmp = yield* local(Type.i32);
        const result = yield* Ctrl.if(x.gt(10))
          .then(() => [
            Loc.set(tmp, x.mul(2)),
            tmp.add(1), // last: ChainableExpr → return value
          ])
          .else(() => [
            Loc.set(tmp, x.add(5)),
            tmp, // last: WasmRef → return value
          ]);
        return result;
      });
    });

    const { exports } = await instantiate(binary);
    const compute = exports.compute as (x: number) => number;
    // x=20 > 10: tmp = 40, return 40+1 = 41
    expect(compute(20)).toBe(41);
    // x=3 <= 10: tmp = 8, return 8
    expect(compute(3)).toBe(8);
  });

  test("if expression with array body returning a number literal", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("sign", { x: Type.i32 }, function* (x) {
        const result = yield* Ctrl.if(x.gt(0))
          .then(() => [
            1, // D-04: number → return value
          ])
          .else(() => [
            -1, // D-04: number → return value
          ]);
        return result;
      });
    });

    const { exports } = await instantiate(binary);
    const sign = exports.sign as (x: number) => number;
    expect(sign(5)).toBe(1);
    expect(sign(-3)).toBe(-1);
  });

  test("array body without value return (backward compat)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("store_and_load", { x: Type.i32 }, function* (x) {
        // Array body without value return — all are void statements (Mem.store returns FuncGen<void>)
        yield* Ctrl.if(x.gt(0))
          .then(() => [
            Mem.store(0, x.mul(2)),
          ])
          .else(() => [
            Mem.store(0, 0),
          ]);
        return yield* Mem.load(0);
      });
    });

    const { exports } = await instantiate(binary);
    const storeAndLoad = exports.store_and_load as (x: number) => number;
    expect(storeAndLoad(5)).toBe(10);
    expect(storeAndLoad(-1)).toBe(0);
  });
});
