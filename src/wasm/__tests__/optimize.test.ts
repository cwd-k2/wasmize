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
