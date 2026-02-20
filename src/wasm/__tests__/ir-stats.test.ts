import { describe, test, expect } from "vitest";
import { IR } from "../ir";
import type { FuncDef } from "../module";
import { analyzeFunc, analyzeModule, formatStats } from "../ir-stats";

describe("analyzeFunc", () => {
  test("counts nodes in simple body", () => {
    const body = [IR.binop("add", IR.local_get(0), IR.const_i32(1))];
    const stats = analyzeFunc(body);
    expect(stats.totalNodes).toBe(3); // binop + local_get + const_i32
    expect(stats.nodesByOp["binop"]).toBe(1);
    expect(stats.nodesByOp["local_get"]).toBe(1);
    expect(stats.nodesByOp["const_i32"]).toBe(1);
  });

  test("counts memory operations", () => {
    const body = [IR.store_i32(IR.const_i32(0), IR.load_i32(IR.const_i32(4)))];
    const stats = analyzeFunc(body);
    expect(stats.memoryLoads).toBe(1);
    expect(stats.memoryStores).toBe(1);
  });

  test("counts branches", () => {
    const body = [IR.if_then_else(IR.const_i32(1), [IR.br(0)], [IR.nop()], "void")];
    const stats = analyzeFunc(body);
    expect(stats.branches).toBe(2); // if + br
  });

  test("counts calls", () => {
    const body = [IR.call(0, [IR.const_i32(1)]), IR.call(1, [])];
    const stats = analyzeFunc(body);
    expect(stats.calls).toBe(2);
  });

  test("counts local accesses", () => {
    const body = [IR.local_set(0, IR.local_get(1)), IR.local_tee(2, IR.const_i32(0))];
    const stats = analyzeFunc(body);
    expect(stats.localAccesses).toBe(3); // set + get + tee
  });

  test("tracks max depth", () => {
    // depth 0: store_i32, depth 1: const_i32 (addr) + binop (val), depth 2: local_get + const_i32
    const body = [IR.store_i32(IR.const_i32(0), IR.binop("add", IR.local_get(0), IR.const_i32(1)))];
    const stats = analyzeFunc(body);
    expect(stats.maxDepth).toBe(2);
  });

  test("empty body returns zero stats", () => {
    const stats = analyzeFunc([]);
    expect(stats.totalNodes).toBe(0);
    expect(stats.maxDepth).toBe(0);
  });
});

describe("analyzeModule", () => {
  test("aggregates across functions", () => {
    const funcs: FuncDef[] = [
      { params: ["i32"], results: ["i32"], locals: [], body: [IR.local_get(0)] },
      { params: ["i32"], results: ["i32"], locals: [], body: [IR.local_get(0)] },
    ];
    const { total, perFunction } = analyzeModule(funcs);
    expect(perFunction).toHaveLength(2);
    expect(total.totalNodes).toBe(2);
    expect(total.localAccesses).toBe(2);
  });

  test("takes max depth across functions", () => {
    const funcs: FuncDef[] = [
      { params: [], results: [], locals: [], body: [IR.const_i32(1)] },
      {
        params: [],
        results: ["i32"],
        locals: [],
        body: [IR.binop("add", IR.const_i32(1), IR.const_i32(2))],
      },
    ];
    const { total } = analyzeModule(funcs);
    expect(total.maxDepth).toBe(1); // binop children at depth 1
  });
});

describe("formatStats", () => {
  test("produces readable output", () => {
    const body = [
      IR.store_i32(IR.const_i32(0), IR.local_get(0)),
      IR.if_then_else(IR.const_i32(1), [IR.nop()], [], "void"),
    ];
    const stats = analyzeFunc(body);
    const output = formatStats(stats);
    expect(output).toContain("Total nodes:");
    expect(output).toContain("Max depth:");
    expect(output).toContain("Memory:");
    expect(output).toContain("Branches:");
    expect(output).toContain("Nodes by op:");
  });
});
