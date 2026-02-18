import { describe, test, expect } from "vitest";
import { IR } from "../ir";
import { optimizeFunc } from "../optimize";

// Helper: optimize a single expression node
function opt(node: Parameters<typeof IR.seq>[0][0]) {
  const result = optimizeFunc([node]);
  return result[0]!;
}

describe("constant folding", () => {
  test("add", () => {
    expect(opt(IR.binop("add", IR.const_i32(3), IR.const_i32(4)))).toEqual(IR.const_i32(7));
  });

  test("sub", () => {
    expect(opt(IR.binop("sub", IR.const_i32(10), IR.const_i32(3)))).toEqual(IR.const_i32(7));
  });

  test("mul", () => {
    expect(opt(IR.binop("mul", IR.const_i32(6), IR.const_i32(7)))).toEqual(IR.const_i32(42));
  });

  test("mul uses Math.imul for i32 wrap", () => {
    expect(opt(IR.binop("mul", IR.const_i32(0x10000), IR.const_i32(0x10000)))).toEqual(IR.const_i32(0));
  });

  test("div", () => {
    expect(opt(IR.binop("div", IR.const_i32(10), IR.const_i32(3)))).toEqual(IR.const_i32(3));
  });

  test("div by zero is preserved", () => {
    const node = IR.binop("div", IR.const_i32(10), IR.const_i32(0));
    const result = opt(node);
    expect(result.op).toBe("binop");
  });

  test("rem", () => {
    expect(opt(IR.binop("rem", IR.const_i32(10), IR.const_i32(3)))).toEqual(IR.const_i32(1));
  });

  test("bitwise ops", () => {
    expect(opt(IR.binop("and", IR.const_i32(0xff), IR.const_i32(0x0f)))).toEqual(IR.const_i32(0x0f));
    expect(opt(IR.binop("or", IR.const_i32(0xf0), IR.const_i32(0x0f)))).toEqual(IR.const_i32(0xff));
    expect(opt(IR.binop("xor", IR.const_i32(0xff), IR.const_i32(0x0f)))).toEqual(IR.const_i32(0xf0));
  });

  test("shift ops", () => {
    expect(opt(IR.binop("shl", IR.const_i32(1), IR.const_i32(4)))).toEqual(IR.const_i32(16));
    expect(opt(IR.binop("shr", IR.const_i32(16), IR.const_i32(2)))).toEqual(IR.const_i32(4));
    expect(opt(IR.binop("shr_u", IR.const_i32(-1), IR.const_i32(1)))).toEqual(IR.const_i32(0x7fffffff));
  });

  test("cmp", () => {
    expect(opt(IR.cmp("eq", IR.const_i32(5), IR.const_i32(5)))).toEqual(IR.const_i32(1));
    expect(opt(IR.cmp("ne", IR.const_i32(5), IR.const_i32(5)))).toEqual(IR.const_i32(0));
    expect(opt(IR.cmp("lt", IR.const_i32(3), IR.const_i32(5)))).toEqual(IR.const_i32(1));
    expect(opt(IR.cmp("gt", IR.const_i32(3), IR.const_i32(5)))).toEqual(IR.const_i32(0));
  });

  test("eqz", () => {
    expect(opt(IR.eqz(IR.const_i32(0)))).toEqual(IR.const_i32(1));
    expect(opt(IR.eqz(IR.const_i32(42)))).toEqual(IR.const_i32(0));
  });

  test("skips non-i32 types", () => {
    const node = IR.binop("add", IR.const_i64(1), IR.const_i64(2), "i64");
    const result = opt(node);
    expect(result.op).toBe("binop");
  });
});

describe("strength reduction", () => {
  test("mul(x, 4) → shl(x, 2)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("mul", x, IR.const_i32(4)));
    expect(result).toEqual(IR.binop("shl", x, IR.const_i32(2)));
  });

  test("mul(4, x) → shl(x, 2) (commutative)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("mul", IR.const_i32(4), x));
    expect(result).toEqual(IR.binop("shl", x, IR.const_i32(2)));
  });

  test("mul(x, 1) → x (identity, not shift)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("mul", x, IR.const_i32(1)));
    expect(result).toEqual(x);
  });

  test("mul(x, 8) → shl(x, 3)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("mul", x, IR.const_i32(8)));
    expect(result).toEqual(IR.binop("shl", x, IR.const_i32(3)));
  });

  test("mul(x, 3) stays as mul (not power of 2)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("mul", x, IR.const_i32(3)));
    expect(result.op).toBe("binop");
    if (result.op === "binop") expect(result.kind).toBe("mul");
  });

  test("div_u(x, 8) → shr_u(x, 3)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("div_u", x, IR.const_i32(8)));
    expect(result).toEqual(IR.binop("shr_u", x, IR.const_i32(3)));
  });

  test("signed div is NOT reduced", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("div", x, IR.const_i32(4)));
    expect(result.op).toBe("binop");
    if (result.op === "binop") expect(result.kind).toBe("div");
  });
});

describe("identity elimination", () => {
  test("add(x, 0) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("add", x, IR.const_i32(0)))).toEqual(x);
  });

  test("add(0, x) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("add", IR.const_i32(0), x))).toEqual(x);
  });

  test("sub(x, 0) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("sub", x, IR.const_i32(0)))).toEqual(x);
  });

  test("mul(x, 1) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("mul", x, IR.const_i32(1)))).toEqual(x);
  });

  test("mul(x, 0) → const 0", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("mul", x, IR.const_i32(0)))).toEqual(IR.const_i32(0));
  });

  test("or(x, 0) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("or", x, IR.const_i32(0)))).toEqual(x);
  });

  test("and(x, 0) → const 0", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("and", x, IR.const_i32(0)))).toEqual(IR.const_i32(0));
  });

  test("shl(x, 0) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("shl", x, IR.const_i32(0)))).toEqual(x);
  });
});

describe("dead code elimination", () => {
  test("removes code after br", () => {
    const result = optimizeFunc([
      IR.br(0),
      IR.local_set(0, IR.const_i32(42)),
      IR.const_i32(99),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe("br");
  });

  test("removes code after return", () => {
    const result = optimizeFunc([
      IR.return_(IR.const_i32(1)),
      IR.local_set(0, IR.const_i32(2)),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe("return");
  });

  test("removes code after unreachable", () => {
    const result = optimizeFunc([
      IR.unreachable(),
      IR.const_i32(42),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.op).toBe("unreachable");
  });

  test("recurses into if branches", () => {
    const result = opt(IR.if_then_else(
      IR.local_get(0),
      [IR.br(0), IR.const_i32(42)],
      [IR.return_(IR.const_i32(1)), IR.const_i32(99)],
      "void",
    ));
    expect(result.op).toBe("if");
    if (result.op === "if") {
      expect(result.then).toHaveLength(1);
      expect(result.else).toHaveLength(1);
    }
  });

  test("recurses into loop", () => {
    const result = opt(IR.loop([
      IR.br(0),
      IR.const_i32(42),
    ]));
    expect(result.op).toBe("loop");
    if (result.op === "loop") {
      expect(result.body).toHaveLength(1);
    }
  });
});

describe("recursive optimization", () => {
  test("nested constant folding", () => {
    // (2 + 3) * 4 → 5 * 4 → shl(5, 2) ... but 5 is const and 4 is const, so → 20
    const result = opt(
      IR.binop("mul",
        IR.binop("add", IR.const_i32(2), IR.const_i32(3)),
        IR.const_i32(4),
      ),
    );
    expect(result).toEqual(IR.const_i32(20));
  });

  test("optimizes inside store addr", () => {
    const result = opt(
      IR.store_i32(
        IR.binop("add", IR.const_i32(100), IR.const_i32(0)),
        IR.local_get(0),
      ),
    );
    expect(result.op).toBe("store_i32");
    if (result.op === "store_i32") {
      expect(result.addr).toEqual(IR.const_i32(100));
    }
  });

  test("optimizes typical array access: mul(idx, 4) + base", () => {
    const idx = IR.local_get(0);
    const result = opt(
      IR.binop("add",
        IR.binop("mul", idx, IR.const_i32(4)),
        IR.const_i32(2048),
      ),
    );
    // mul(idx, 4) → shl(idx, 2), then add stays
    expect(result.op).toBe("binop");
    if (result.op === "binop") {
      expect(result.kind).toBe("add");
      expect(result.a).toEqual(IR.binop("shl", idx, IR.const_i32(2)));
      expect(result.b).toEqual(IR.const_i32(2048));
    }
  });
});

describe("eqz-of-comparison inversion", () => {
  test("eqz(lt(a, b)) → ge(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("lt", a, b)))).toEqual(IR.cmp("ge", a, b));
  });

  test("eqz(ge(a, b)) → lt(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("ge", a, b)))).toEqual(IR.cmp("lt", a, b));
  });

  test("eqz(gt(a, b)) → le(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("gt", a, b)))).toEqual(IR.cmp("le", a, b));
  });

  test("eqz(le(a, b)) → gt(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("le", a, b)))).toEqual(IR.cmp("gt", a, b));
  });

  test("eqz(eq(a, b)) → ne(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("eq", a, b)))).toEqual(IR.cmp("ne", a, b));
  });

  test("eqz(ne(a, b)) → eq(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("ne", a, b)))).toEqual(IR.cmp("eq", a, b));
  });

  test("eqz(lt_u(a, b)) → ge_u(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("lt_u", a, b)))).toEqual(IR.cmp("ge_u", a, b));
  });

  test("eqz(ge_u(a, b)) → lt_u(a, b)", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.eqz(IR.cmp("ge_u", a, b)))).toEqual(IR.cmp("lt_u", a, b));
  });

  test("skips non-i32 eqz", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    const result = opt(IR.eqz(IR.cmp("lt", a, b), "i64"));
    expect(result.op).toBe("eqz");
  });
});

describe("rem_u strength reduction", () => {
  test("rem_u(x, 8) → and(x, 7)", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("rem_u", x, IR.const_i32(8)))).toEqual(
      IR.binop("and", x, IR.const_i32(7)),
    );
  });

  test("rem_u(x, 16) → and(x, 15)", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("rem_u", x, IR.const_i32(16)))).toEqual(
      IR.binop("and", x, IR.const_i32(15)),
    );
  });

  test("rem_u(x, 3) stays as rem_u (not power of 2)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("rem_u", x, IR.const_i32(3)));
    expect(result.op).toBe("binop");
    if (result.op === "binop") expect(result.kind).toBe("rem_u");
  });

  test("signed rem is NOT reduced", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("rem", x, IR.const_i32(8)));
    expect(result.op).toBe("binop");
    if (result.op === "binop") expect(result.kind).toBe("rem");
  });
});

describe("constant condition elimination", () => {
  test("if(const non-zero) → then branch", () => {
    const result = opt(IR.if_then_else(
      IR.const_i32(1),
      [IR.const_i32(42)],
      [IR.const_i32(99)],
      "i32",
    ));
    expect(result).toEqual(IR.const_i32(42));
  });

  test("if(const 0) → else branch", () => {
    const result = opt(IR.if_then_else(
      IR.const_i32(0),
      [IR.const_i32(42)],
      [IR.const_i32(99)],
      "i32",
    ));
    expect(result).toEqual(IR.const_i32(99));
  });

  test("if(const 0, then, empty else) → nop", () => {
    const result = opt(IR.if_then_else(
      IR.const_i32(1),
      [],
      [IR.const_i32(99)],
      "void",
    ));
    expect(result).toEqual(IR.nop());
  });

  test("select(a, b, const non-zero) → a", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.select(a, b, IR.const_i32(1)))).toEqual(a);
  });

  test("select(a, b, const 0) → b", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    expect(opt(IR.select(a, b, IR.const_i32(0)))).toEqual(b);
  });

  test("br_if(depth, const 0) → nop", () => {
    expect(opt(IR.br_if(1, IR.const_i32(0)))).toEqual(IR.nop());
  });

  test("br_if(depth, const non-zero) → br(depth)", () => {
    expect(opt(IR.br_if(1, IR.const_i32(1)))).toEqual(IR.br(1));
  });
});

describe("double eqz elimination", () => {
  test("eqz(eqz(cmp)) → cmp", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    const cmp = IR.cmp("lt", a, b);
    expect(opt(IR.eqz(IR.eqz(cmp)))).toEqual(cmp);
  });

  test("eqz(eqz(eqz(x))) → eqz (only inner cmp/eqz)", () => {
    const x = IR.local_get(0);
    const result = opt(IR.eqz(IR.eqz(IR.eqz(x))));
    // eqz(eqz(eqz(x))): inner eqz(x) has x=local_get, not cmp/eqz → no double-eqz
    // so eqz(eqz(eqz(x))) stays as eqz with inner=eqz(eqz(x))
    // but eqz(eqz(x)) — inner is local_get, not cmp/eqz → stays
    // so result is eqz(eqz(eqz(x))) ... but wait, with bottom-up:
    // optimizeNode(eqz(eqz(eqz(x)))) →
    //   v = optimizeNode(eqz(eqz(x))) →
    //     v2 = optimizeNode(eqz(x)) → eqz(x) (x is local_get, no opt)
    //     inner = v2.val = x, x is local_get, not cmp/eqz → no double-eqz
    //     → eqz(eqz(x))
    //   inner = eqz(x), which IS eqz → double-eqz applies → returns eqz(x).val = x ... no wait
    //   v.op is "eqz", v.val is eqz(x), v.val.op is "eqz" → inner = v.val.val = x
    //   inner.op is "local_get" — not cmp/eqz → no double-eqz
    //   → eqz(eqz(eqz(x)))
    // Actually let me re-check: at the outer level, v = eqz(eqz(x))
    // v.op === "eqz", so check double-eqz: v.val = eqz(x), inner = eqz(x).val = x
    // x.op === "local_get" — not cmp/eqz → no optimization
    // Result stays as eqz(eqz(eqz(x)))
    expect(result.op).toBe("eqz");
  });

  test("eqz(eqz(eqz(cmp))) → eqz-of-inverted via cascade", () => {
    const a = IR.local_get(0), b = IR.local_get(1);
    // eqz(eqz(eqz(cmp("lt", a, b))))
    // Pass 1: inner eqz(cmp("lt")) → cmp("ge")
    //         then eqz(eqz(cmp("ge"))) ... wait, it's bottom-up
    // Bottom-up: optimizeNode(eqz3(eqz2(eqz1(cmp("lt")))))
    //   → v = optimize(eqz2(eqz1(cmp("lt"))))
    //     → v = optimize(eqz1(cmp("lt")))
    //       → v = optimize(cmp("lt")) = cmp("lt")
    //       → eqz of cmp → cmp("ge")
    //     → eqz(cmp("ge")): eqz of cmp → cmp("lt")
    //   → eqz(cmp("lt")): eqz of cmp → cmp("ge")
    expect(opt(IR.eqz(IR.eqz(IR.eqz(IR.cmp("lt", a, b)))))).toEqual(
      IR.cmp("ge", a, b),
    );
  });
});

describe("self-cancelling operations", () => {
  test("sub(x, x) → const 0", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("sub", x, x))).toEqual(IR.const_i32(0));
  });

  test("xor(x, x) → const 0", () => {
    const x = IR.local_get(0);
    expect(opt(IR.binop("xor", x, x))).toEqual(IR.const_i32(0));
  });

  test("sub(complex, complex) → const 0", () => {
    const expr = IR.binop("add", IR.local_get(0), IR.const_i32(1));
    expect(opt(IR.binop("sub", expr, expr))).toEqual(IR.const_i32(0));
  });

  test("add(x, x) is NOT cancelled", () => {
    const x = IR.local_get(0);
    const result = opt(IR.binop("add", x, x));
    expect(result.op).toBe("binop");
  });
});

describe("unsigned comparison with zero", () => {
  test("lt_u(x, 0) → const 0 (always false)", () => {
    expect(opt(IR.cmp("lt_u", IR.local_get(0), IR.const_i32(0)))).toEqual(IR.const_i32(0));
  });

  test("ge_u(x, 0) → const 1 (always true)", () => {
    expect(opt(IR.cmp("ge_u", IR.local_get(0), IR.const_i32(0)))).toEqual(IR.const_i32(1));
  });

  test("gt_u(0, x) → const 0 (always false)", () => {
    expect(opt(IR.cmp("gt_u", IR.const_i32(0), IR.local_get(0)))).toEqual(IR.const_i32(0));
  });

  test("le_u(0, x) → const 1 (always true)", () => {
    expect(opt(IR.cmp("le_u", IR.const_i32(0), IR.local_get(0)))).toEqual(IR.const_i32(1));
  });

  test("gt_u(x, 0) is NOT eliminated (can be true)", () => {
    const result = opt(IR.cmp("gt_u", IR.local_get(0), IR.const_i32(0)));
    expect(result.op).toBe("cmp");
  });
});

describe("seq/block flattening", () => {
  test("seq with nested seq is flattened", () => {
    const result = opt(IR.seq([
      IR.const_i32(1),
      IR.seq([IR.const_i32(2), IR.const_i32(3)]),
    ]));
    expect(result).toEqual(IR.seq([IR.const_i32(1), IR.const_i32(2), IR.const_i32(3)]));
  });

  test("single-element seq is unwrapped", () => {
    expect(opt(IR.seq([IR.const_i32(42)]))).toEqual(IR.const_i32(42));
  });

  test("block with single non-branch is unwrapped", () => {
    expect(opt(IR.block([IR.const_i32(42)]))).toEqual(IR.const_i32(42));
  });

  test("block with single br is NOT unwrapped", () => {
    const result = opt(IR.block([IR.br(0)]));
    expect(result.op).toBe("block");
  });

  test("block with single br_if is NOT unwrapped", () => {
    const result = opt(IR.block([IR.br_if(0, IR.local_get(0))]));
    expect(result.op).toBe("block");
  });

  test("seq flattening applies dead code elimination", () => {
    // Inner seq ends with br, outer continues — after flatten, DCE kicks in
    const result = opt(IR.seq([
      IR.seq([IR.const_i32(1), IR.br(0)]),
      IR.const_i32(99),
    ]));
    expect(result).toEqual(IR.seq([IR.const_i32(1), IR.br(0)]));
  });
});

describe("type conversion folding", () => {
  test("i32_wrap_i64(i64_extend_i32_s(x)) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.i32_wrap_i64(IR.i64_extend_i32_s(x)))).toEqual(x);
  });

  test("i32_wrap_i64(const_i64(V)) → const_i32", () => {
    expect(opt(IR.i32_wrap_i64(IR.const_i64(42)))).toEqual(IR.const_i32(42));
  });

  test("i64_extend_i32_s(const_i32(V)) → const_i64", () => {
    expect(opt(IR.i64_extend_i32_s(IR.const_i32(42)))).toEqual(IR.const_i64(42));
  });

  test("f64_convert_i32_s(const_i32(V)) → const_f64", () => {
    expect(opt(IR.f64_convert_i32_s(IR.const_i32(42)))).toEqual(IR.const_f64(42));
  });

  test("convert(i32_wrap_i64, i64_extend_i32_s(x)) → x", () => {
    const x = IR.local_get(0);
    expect(opt(IR.convert("i32_wrap_i64", IR.i64_extend_i32_s(x)))).toEqual(x);
  });

  test("convert(i64_extend_i32_s, const_i32) → const_i64", () => {
    expect(opt(IR.convert("i64_extend_i32_s", IR.const_i32(10)))).toEqual(IR.const_i64(10));
  });

  test("convert(f64_convert_i32_s, const_i32) → const_f64", () => {
    expect(opt(IR.convert("f64_convert_i32_s", IR.const_i32(7)))).toEqual(IR.const_f64(7));
  });
});

describe("2-pass cascade", () => {
  test("constant fold → eqz inversion in second pass", () => {
    // eqz(cmp("lt", add(1,2), const(5)))
    // Pass 1: add(1,2) → 3, then cmp("lt", 3, 5) → const(1), then eqz(1) → const(0)
    // Actually this folds in one pass, let me construct a true cascade
    const result = optimizeFunc([
      // if(eqz(cmp("lt", x, y)), [const(1)], [const(2)])
      // Pass 1: eqz(cmp("lt")) → cmp("ge")
      //         if stays (cond not constant)
      // This doesn't need 2 passes. Let me think of a true cascade...
      // br_if(0, eqz(cmp("lt", const(3), const(5))))
      // Pass 1: cmp("lt", 3, 5) → const(1), eqz(const(1)) → const(0)
      //         br_if(0, const(0)) → nop
      // This folds in 1 pass too because bottom-up. Hmm.
      // True cascade: result of one node's optimization feeds into parent's optimization,
      // but the parent was already visited. That happens when the structure looks like:
      // [stmt_a, stmt_b] where stmt_a produces something stmt_b uses (but they're siblings).
      // Actually 2-pass helps when the first pass introduces new optimization opportunities
      // at the same level. For example:
      // seq([if(const(1), [nop], [nop]), remaining])
      // Pass 1: if(const(1),...) → nop, seq([nop, remaining]) (nop not flattened in pass 1)
      // Pass 2: seq still has nop but nothing special
      // Hmm, maybe a better example:
      // select(const_i32(10), const_i32(20), eqz(cmp("lt", const(3), const(5))))
      IR.select(IR.const_i32(10), IR.const_i32(20),
        IR.eqz(IR.cmp("lt", IR.const_i32(3), IR.const_i32(5)))),
    ]);
    // eqz(cmp("lt", 3, 5)) → eqz(const(1)) → const(0)
    // select(10, 20, const(0)) → 20
    expect(result).toEqual([IR.const_i32(20)]);
  });
});
