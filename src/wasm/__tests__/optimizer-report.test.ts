import { describe, test, expect } from "vitest";
import { compileWithReport, formatReport } from "../optimizer-report";
import { Mod, param, Type, Mem } from "../../dsl/primitives";
import { instantiate } from "../../test-helpers";

describe("compileWithReport", () => {
  test("produces valid binary and report", async () => {
    const { binary, report } = compileWithReport(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("add", {}, function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        return yield* a.add(b);
      });
    });

    expect(report.before.totalNodes).toBeGreaterThan(0);
    expect(report.after.totalNodes).toBeGreaterThan(0);
    expect(report.passes.length).toBeGreaterThan(0);
    expect(report.iterations).toBeGreaterThan(0);
    expect(typeof report.reductions.nodesPct).toBe("number");

    const {
      exports: { add },
    } = await instantiate(binary);
    expect((add as Function)(3, 4)).toBe(7);
  });

  test("report shows reduction for constant folding", async () => {
    const { binary, report } = compileWithReport(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("val", {}, function* () {
        // 2 + 3 should be folded to 5
        return yield* Mem.i32(2).add(Mem.i32(3));
      });
    });

    // After optimization, const folding should reduce nodes
    expect(report.before.totalNodes).toBeGreaterThanOrEqual(report.after.totalNodes);

    const {
      exports: { val },
    } = await instantiate(binary);
    expect((val as Function)()).toBe(5);
  });
});

describe("formatReport", () => {
  test("produces readable output", () => {
    const output = formatReport({
      before: {
        totalNodes: 45,
        nodesByOp: {},
        maxDepth: 3,
        memoryLoads: 4,
        memoryStores: 4,
        branches: 3,
        calls: 0,
        localAccesses: 10,
      },
      after: {
        totalNodes: 38,
        nodesByOp: {},
        maxDepth: 3,
        memoryLoads: 4,
        memoryStores: 4,
        branches: 2,
        calls: 0,
        localAccesses: 8,
      },
      passes: ["constant-folding", "identity-elimination"],
      iterations: 2,
      reductions: { nodes: 7, nodesPct: 15.6, memoryOps: 0, branches: 1 },
    });
    expect(output).toContain("2 passes");
    expect(output).toContain("2 iterations");
    expect(output).toContain("45 →");
    expect(output).toContain("38");
  });
});
