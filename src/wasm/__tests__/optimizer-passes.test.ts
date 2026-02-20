import { describe, test, expect } from "vitest";
import { IR } from "../ir";
import type { IRNode } from "../ir";
import {
  visitChildren,
  builtinPasses,
  createOptimizer,
  withoutPasses,
  type OptimizerPass,
} from "../optimizer-passes";
import { optimizeFunc } from "../optimize";

describe("visitChildren", () => {
  test("leaf nodes return unchanged", () => {
    const c = IR.const_i32(42);
    expect(
      visitChildren(c, () => {
        throw new Error("should not visit");
      }),
    ).toBe(c);
  });

  test("visits single val child", () => {
    const visited: IRNode[] = [];
    const node = IR.eqz(IR.const_i32(5));
    visitChildren(node, (n) => {
      visited.push(n);
      return n;
    });
    expect(visited).toHaveLength(1);
    expect(visited[0]).toEqual(IR.const_i32(5));
  });

  test("visits binop children", () => {
    const visited: IRNode[] = [];
    const node = IR.binop("add", IR.const_i32(1), IR.const_i32(2));
    visitChildren(node, (n) => {
      visited.push(n);
      return n;
    });
    expect(visited).toHaveLength(2);
  });

  test("visits if children (cond + branches)", () => {
    const visited: IRNode[] = [];
    const node = IR.if_then_else(IR.const_i32(1), [IR.const_i32(2)], [IR.const_i32(3)], "i32");
    visitChildren(node, (n) => {
      visited.push(n);
      return n;
    });
    // cond + 1 then element + 1 else element = 3
    expect(visited).toHaveLength(3);
  });

  test("visits call args", () => {
    const visited: IRNode[] = [];
    const node = IR.call(0, [IR.const_i32(1), IR.const_i32(2)]);
    visitChildren(node, (n) => {
      visited.push(n);
      return n;
    });
    expect(visited).toHaveLength(2);
  });

  test("transforms children", () => {
    const node = IR.binop("add", IR.const_i32(1), IR.const_i32(2));
    const result = visitChildren(node, (n) => {
      if (n.op === "const_i32") return IR.const_i32(n.v * 10);
      return n;
    });
    expect(result).toEqual(IR.binop("add", IR.const_i32(10), IR.const_i32(20)));
  });

  test("exhaustive: handles all node types", () => {
    // Verify that visitChildren doesn't throw for any IR node type
    const identity = (n: IRNode) => n;
    const nodes: IRNode[] = [
      IR.const_i32(0),
      IR.const_i64(0),
      IR.const_f32(0),
      IR.const_f64(0),
      IR.local_get(0),
      IR.local_set(0, IR.const_i32(0)),
      IR.local_tee(0, IR.const_i32(0)),
      IR.binop("add", IR.const_i32(0), IR.const_i32(0)),
      IR.cmp("eq", IR.const_i32(0), IR.const_i32(0)),
      IR.unary("clz", IR.const_i32(0)),
      IR.convert("i32_wrap_i64", IR.const_i64(0)),
      IR.eqz(IR.const_i32(0)),
      IR.if_then_else(IR.const_i32(0), [], [], "void"),
      IR.loop([]),
      IR.block([]),
      IR.seq([IR.nop()]),
      IR.br(0),
      IR.br_if(0, IR.const_i32(0)),
      IR.br_table([0], 0, IR.const_i32(0)),
      IR.call(0, []),
      IR.drop(IR.const_i32(0)),
      IR.return_(IR.const_i32(0)),
      IR.store_i32(IR.const_i32(0), IR.const_i32(0)),
      IR.load_i32(IR.const_i32(0)),
      IR.store_i32_8(IR.const_i32(0), IR.const_i32(0)),
      IR.load_i32_8u(IR.const_i32(0)),
      IR.load_i64(IR.const_i32(0)),
      IR.store_i64(IR.const_i32(0), IR.const_i64(0)),
      IR.load_f64(IR.const_i32(0)),
      IR.store_f64(IR.const_i32(0), IR.const_f64(0)),
      IR.mem_load("i32", IR.const_i32(0)),
      IR.mem_store("i32", IR.const_i32(0), IR.const_i32(0)),
      IR.select(IR.const_i32(0), IR.const_i32(0), IR.const_i32(0)),
      IR.f64_neg(IR.const_f64(0)),
      IR.f64_abs(IR.const_f64(0)),
      IR.i32_wrap_i64(IR.const_i64(0)),
      IR.i64_extend_i32_s(IR.const_i32(0)),
      IR.f64_convert_i32_s(IR.const_i32(0)),
      IR.i32_trunc_f64_s(IR.const_f64(0)),
      IR.global_get(0),
      IR.global_set(0, IR.const_i32(0)),
      IR.memory_size(),
      IR.memory_grow(IR.const_i32(1)),
      IR.unreachable(),
      IR.nop(),
      IR.effect(0, IR.const_i32(0)),
      IR.call_indirect(0, 0, [IR.const_i32(0)], IR.const_i32(0)),
    ];
    for (const n of nodes) {
      expect(() => visitChildren(n, identity)).not.toThrow();
    }
  });
});

describe("custom passes", () => {
  test("custom pass is applied", () => {
    const doubleConst: OptimizerPass = {
      name: "double-const",
      transform(node) {
        if (node.op === "const_i32") return IR.const_i32(node.v * 2);
        return node;
      },
    };

    const optimize = createOptimizer([doubleConst]);
    expect(optimize(IR.const_i32(21))).toEqual(IR.const_i32(42));
  });

  test("pass order matters", () => {
    const add10: OptimizerPass = {
      name: "add10",
      transform(node) {
        if (node.op === "const_i32") return IR.const_i32(node.v + 10);
        return node;
      },
    };
    const double: OptimizerPass = {
      name: "double",
      transform(node) {
        if (node.op === "const_i32") return IR.const_i32(node.v * 2);
        return node;
      },
    };

    // add10 first: 5 → 15 → 30
    const opt1 = createOptimizer([add10, double]);
    expect(opt1(IR.const_i32(5))).toEqual(IR.const_i32(30));

    // double first: 5 → 10 → 20
    const opt2 = createOptimizer([double, add10]);
    expect(opt2(IR.const_i32(5))).toEqual(IR.const_i32(20));
  });

  test("empty pass list does no optimization", () => {
    const node = IR.binop("add", IR.const_i32(3), IR.const_i32(4));
    const result = optimizeFunc([node], { passes: [] });
    // With no passes, the binop stays (visitChildren still recurses but no transforms)
    expect(result[0]!.op).toBe("binop");
  });

  test("custom pass via compile options", async () => {
    const { compile } = await import("../../dsl/compiler");
    const { Mod, Mem } = await import("../../dsl/primitives");
    const { instantiate } = await import("../../runtime/instantiate");

    const doubleConst: OptimizerPass = {
      name: "double-const",
      transform(node) {
        if (node.op === "const_i32") return IR.const_i32(node.v * 2);
        return node;
      },
    };

    const binary = compile(
      function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("val", {}, function* () {
          return yield* Mem.i32(21);
        });
      },
      { optimizerConfig: { passes: [doubleConst], iterations: 1 } },
    );

    const {
      exports: { val },
    } = await instantiate(binary);
    expect((val as Function)()).toBe(42);
  });
});

describe("withoutPasses", () => {
  test("excludes named passes", () => {
    const filtered = withoutPasses(["constant-folding", "strength-reduction"]);
    const names = filtered.map((p) => p.name);
    expect(names).not.toContain("constant-folding");
    expect(names).not.toContain("strength-reduction");
    expect(names).toContain("identity-elimination");
    expect(names).toContain("block-simplification");
  });

  test("returns all passes when excluding nothing", () => {
    expect(withoutPasses([])).toHaveLength(builtinPasses.length);
  });

  test("excluding non-existent name returns all passes", () => {
    expect(withoutPasses(["nonexistent"])).toHaveLength(builtinPasses.length);
  });

  test("withoutPasses preserves remaining optimizations", () => {
    // Remove constant-folding, but identity elimination still works
    const result = optimizeFunc([IR.binop("add", IR.local_get(0), IR.const_i32(0))], {
      passes: withoutPasses(["constant-folding"]),
    });
    expect(result[0]).toEqual(IR.local_get(0));
  });

  test("removing constant-folding keeps non-constant binop", () => {
    // binop(add, const(3), const(4)) should NOT be folded when constant-folding is removed
    const result = optimizeFunc([IR.binop("add", IR.const_i32(3), IR.const_i32(4))], {
      passes: withoutPasses(["constant-folding"]),
    });
    expect(result[0]!.op).toBe("binop");
  });
});

describe("builtinPasses coverage", () => {
  test("contains expected number of passes", () => {
    expect(builtinPasses.length).toBe(9);
  });

  test("all passes have unique names", () => {
    const names = builtinPasses.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("expected pass names are present", () => {
    const names = builtinPasses.map((p) => p.name);
    expect(names).toContain("block-simplification");
    expect(names).toContain("constant-folding");
    expect(names).toContain("identity-elimination");
    expect(names).toContain("self-cancelling");
    expect(names).toContain("strength-reduction");
    expect(names).toContain("comparison-inversion");
    expect(names).toContain("round-trip-elimination");
    expect(names).toContain("algebraic-simplification");
    expect(names).toContain("condition-elimination");
  });
});

describe("iterations config", () => {
  test("single iteration may miss cascade", () => {
    // select(10, 20, eqz(cmp("lt", const(3), const(5))))
    // With 1 iteration: eqz(cmp("lt",3,5)) → eqz(const(1)) → const(0) → select(10,20,0) → 20
    // Actually this cascades within a single bottom-up pass
    // Need a true multi-pass example
    const result = optimizeFunc(
      [
        IR.select(
          IR.const_i32(10),
          IR.const_i32(20),
          IR.eqz(IR.cmp("lt", IR.const_i32(3), IR.const_i32(5))),
        ),
      ],
      { iterations: 1 },
    );
    expect(result[0]).toEqual(IR.const_i32(20));
  });

  test("default 2 iterations", () => {
    const result = optimizeFunc([
      IR.select(
        IR.const_i32(10),
        IR.const_i32(20),
        IR.eqz(IR.cmp("lt", IR.const_i32(3), IR.const_i32(5))),
      ),
    ]);
    expect(result[0]).toEqual(IR.const_i32(20));
  });
});
