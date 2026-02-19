import type { IRNode, BinopKind, CmpKind } from "./ir";
import { IR } from "./ir";

// --- Helpers ---

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function log2(n: number): number {
  let r = 0;
  while ((1 << r) < n) r++;
  return r;
}

// i32 truncation: replicate `(result | 0)` semantics
function toI32(v: number): number {
  return v | 0;
}

// Structural equality for IR nodes (self-cancelling detection)
function irEqual(a: IRNode, b: IRNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Comparison inversion map for eqz-of-cmp optimization
const invertCmp: Partial<Record<CmpKind, CmpKind>> = {
  lt: "ge", ge: "lt", gt: "le", le: "gt", eq: "ne", ne: "eq",
  lt_u: "ge_u", ge_u: "lt_u", gt_u: "le_u", le_u: "gt_u",
};

// --- Constant folding for i32 binop ---

function foldBinop(kind: BinopKind, a: number, b: number): number | null {
  switch (kind) {
    case "add": return toI32(a + b);
    case "sub": return toI32(a - b);
    case "mul": return toI32(Math.imul(a, b));
    case "div": return b !== 0 ? toI32(a / b) : null;
    case "rem": return b !== 0 ? toI32(a % b) : null;
    case "div_u": return b !== 0 ? ((a >>> 0) / (b >>> 0)) | 0 : null;
    case "rem_u": return b !== 0 ? ((a >>> 0) % (b >>> 0)) | 0 : null;
    case "and": return a & b;
    case "or": return a | b;
    case "xor": return a ^ b;
    case "shl": return a << (b & 31);
    case "shr": return a >> (b & 31);
    case "shr_u": return (a >>> (b & 31)) | 0;
    case "rotl": {
      const s = b & 31;
      return ((a << s) | (a >>> (32 - s))) | 0;
    }
    case "rotr": {
      const s = b & 31;
      return ((a >>> s) | (a << (32 - s))) | 0;
    }
    default: return null;
  }
}

// --- Constant folding for i32 cmp ---

function foldCmp(kind: CmpKind, a: number, b: number): number {
  switch (kind) {
    case "eq": return a === b ? 1 : 0;
    case "ne": return a !== b ? 1 : 0;
    case "lt": return a < b ? 1 : 0;
    case "gt": return a > b ? 1 : 0;
    case "le": return a <= b ? 1 : 0;
    case "ge": return a >= b ? 1 : 0;
    case "lt_u": return (a >>> 0) < (b >>> 0) ? 1 : 0;
    case "gt_u": return (a >>> 0) > (b >>> 0) ? 1 : 0;
    case "le_u": return (a >>> 0) <= (b >>> 0) ? 1 : 0;
    case "ge_u": return (a >>> 0) >= (b >>> 0) ? 1 : 0;
  }
}

// --- Core optimization ---

function optimizeNode(node: IRNode): IRNode {
  switch (node.op) {
    case "binop": {
      const a = optimizeNode(node.a);
      const b = optimizeNode(node.b);
      const type = node.type || "i32";

      // Only fold i32 constants
      if (type === "i32" && a.op === "const_i32" && b.op === "const_i32") {
        const result = foldBinop(node.kind, a.v, b.v);
        if (result !== null) return IR.const_i32(result);
      }

      // Identity elimination (i32 only) — checked before strength reduction
      if (type === "i32") {
        switch (node.kind) {
          case "add":
            if (b.op === "const_i32" && b.v === 0) return a;
            if (a.op === "const_i32" && a.v === 0) return b;
            break;
          case "sub":
            if (b.op === "const_i32" && b.v === 0) return a;
            break;
          case "mul":
            if (b.op === "const_i32" && b.v === 1) return a;
            if (a.op === "const_i32" && a.v === 1) return b;
            if (b.op === "const_i32" && b.v === 0) return IR.const_i32(0);
            if (a.op === "const_i32" && a.v === 0) return IR.const_i32(0);
            break;
          case "or": case "xor":
            if (b.op === "const_i32" && b.v === 0) return a;
            if (a.op === "const_i32" && a.v === 0) return b;
            break;
          case "and":
            if (b.op === "const_i32" && b.v === 0) return IR.const_i32(0);
            if (a.op === "const_i32" && a.v === 0) return IR.const_i32(0);
            break;
          case "shl": case "shr": case "shr_u":
            if (b.op === "const_i32" && b.v === 0) return a;
            break;
        }

        // Self-cancelling: sub(x, x) → 0, xor(x, x) → 0
        if ((node.kind === "sub" || node.kind === "xor") && irEqual(a, b)) {
          return IR.const_i32(0);
        }
      }

      // Strength reduction: mul by power of 2 → shl (i32 only)
      if (type === "i32" && node.kind === "mul") {
        if (b.op === "const_i32" && isPow2(b.v))
          return IR.binop("shl", a, IR.const_i32(log2(b.v)));
        if (a.op === "const_i32" && isPow2(a.v))
          return IR.binop("shl", b, IR.const_i32(log2(a.v)));
      }

      // Strength reduction: div_u by power of 2 → shr_u (i32 only)
      if (type === "i32" && node.kind === "div_u") {
        if (b.op === "const_i32" && isPow2(b.v))
          return IR.binop("shr_u", a, IR.const_i32(log2(b.v)));
      }

      // Strength reduction: rem_u by power of 2 → and mask (i32 only)
      if (type === "i32" && node.kind === "rem_u") {
        if (b.op === "const_i32" && isPow2(b.v))
          return IR.binop("and", a, IR.const_i32(b.v - 1));
      }

      return IR.binop(node.kind, a, b, node.type);
    }

    case "cmp": {
      const a = optimizeNode(node.a);
      const b = optimizeNode(node.b);
      const type = node.type || "i32";

      if (type === "i32" && a.op === "const_i32" && b.op === "const_i32") {
        return IR.const_i32(foldCmp(node.kind, a.v, b.v));
      }

      // Unsigned comparisons with zero
      if (type === "i32") {
        if (node.kind === "lt_u" && b.op === "const_i32" && b.v === 0)
          return IR.const_i32(0);
        if (node.kind === "ge_u" && b.op === "const_i32" && b.v === 0)
          return IR.const_i32(1);
        if (node.kind === "gt_u" && a.op === "const_i32" && a.v === 0)
          return IR.const_i32(0);
        if (node.kind === "le_u" && a.op === "const_i32" && a.v === 0)
          return IR.const_i32(1);
      }

      return IR.cmp(node.kind, a, b, node.type);
    }

    case "eqz": {
      const v = optimizeNode(node.val);
      const type = node.type || "i32";

      // Constant fold
      if (type === "i32" && v.op === "const_i32") {
        return IR.const_i32(v.v === 0 ? 1 : 0);
      }

      // eqz(cmp(kind, a, b)) → cmp(inverted_kind, a, b)
      if (type === "i32" && v.op === "cmp") {
        const inv = invertCmp[v.kind];
        if (inv) return IR.cmp(inv, v.a, v.b, v.type);
      }

      // eqz(eqz(x)) → x (when x is boolean: cmp or eqz result)
      if (type === "i32" && v.op === "eqz") {
        const inner = v.val;
        if (inner.op === "cmp" || inner.op === "eqz") return inner;
      }

      return IR.eqz(v, node.type);
    }

    case "unary":
      return IR.unary(node.kind, optimizeNode(node.val), node.type);

    case "convert": {
      const v = optimizeNode(node.val);

      // Round-trip: wrap(extend(x)) → x
      if (node.kind === "i32_wrap_i64") {
        if (v.op === "i64_extend_i32_s") return v.val;
        if (v.op === "convert" && v.kind === "i64_extend_i32_u") return v.val;
        if (v.op === "const_i64") return IR.const_i32(toI32(v.v));
      }

      // Constant conversions
      if (node.kind === "i64_extend_i32_s" && v.op === "const_i32")
        return IR.const_i64(v.v);
      if (node.kind === "i64_extend_i32_u" && v.op === "const_i32")
        return IR.const_i64(v.v >>> 0);
      if (node.kind === "f64_convert_i32_s" && v.op === "const_i32")
        return IR.const_f64(v.v);

      return IR.convert(node.kind, v);
    }

    case "local_set":
      return IR.local_set(node.i, optimizeNode(node.val));

    case "local_tee":
      return IR.local_tee(node.i, optimizeNode(node.val));

    case "if": {
      const cond = optimizeNode(node.cond);
      const then_ = eliminateDeadCode(node.then.map(optimizeNode));
      const else_ = eliminateDeadCode(node.else.map(optimizeNode));

      // Constant condition elimination
      if (cond.op === "const_i32") {
        const taken = cond.v !== 0 ? then_ : else_;
        if (taken.length === 0) return IR.nop();
        if (taken.length === 1) return taken[0]!;
        return IR.seq(taken);
      }

      return IR.if_then_else(cond, then_, else_, node.type);
    }

    case "loop":
      return IR.loop(eliminateDeadCode(node.body.map(optimizeNode)));

    case "block": {
      const body = eliminateDeadCode(node.body.map(optimizeNode));
      // Unwrap single non-control-flow statement
      if (body.length === 1) {
        const s = body[0]!;
        if (s.op !== "if" && s.op !== "loop" && s.op !== "block" && s.op !== "seq"
          && s.op !== "br" && s.op !== "br_if" && s.op !== "br_table")
          return s;
      }
      return IR.block(body);
    }

    case "seq": {
      const stmts = node.stmts.map(optimizeNode);
      // Flatten nested seqs
      const flat: IRNode[] = [];
      for (const s of stmts) {
        if (s.op === "seq") flat.push(...s.stmts);
        else flat.push(s);
      }
      const result = eliminateDeadCode(flat);
      if (result.length === 1) return result[0]!;
      return IR.seq(result);
    }

    case "br_if": {
      const cond = optimizeNode(node.cond);
      // Constant condition
      if (cond.op === "const_i32") {
        return cond.v !== 0 ? IR.br(node.depth) : IR.nop();
      }
      return IR.br_if(node.depth, cond);
    }

    case "br_table":
      return IR.br_table(node.labels, node.default_, optimizeNode(node.val));

    case "call":
      return IR.call(node.idx, node.args.map(optimizeNode));

    case "global_set":
      return IR.global_set(node.idx, optimizeNode(node.val));

    case "drop":
      return IR.drop(optimizeNode(node.val));

    case "return":
      return IR.return_(optimizeNode(node.val));

    case "select": {
      const a = optimizeNode(node.a);
      const b = optimizeNode(node.b);
      const cond = optimizeNode(node.cond);
      // Constant condition
      if (cond.op === "const_i32") {
        return cond.v !== 0 ? a : b;
      }
      return IR.select(a, b, cond);
    }

    case "store_i32":
      return IR.store_i32(optimizeNode(node.addr), optimizeNode(node.val));
    case "load_i32":
      return IR.load_i32(optimizeNode(node.addr));
    case "store_i32_8":
      return IR.store_i32_8(optimizeNode(node.addr), optimizeNode(node.val));
    case "load_i32_8u":
      return IR.load_i32_8u(optimizeNode(node.addr));
    case "load_i64":
      return IR.load_i64(optimizeNode(node.addr));
    case "store_i64":
      return IR.store_i64(optimizeNode(node.addr), optimizeNode(node.val));
    case "load_f64":
      return IR.load_f64(optimizeNode(node.addr));
    case "store_f64":
      return IR.store_f64(optimizeNode(node.addr), optimizeNode(node.val));
    case "mem_load":
      return IR.mem_load(node.kind, optimizeNode(node.addr));
    case "mem_store":
      return IR.mem_store(node.kind, optimizeNode(node.addr), optimizeNode(node.val));

    case "f64_neg":
      return IR.f64_neg(optimizeNode(node.val));
    case "f64_abs":
      return IR.f64_abs(optimizeNode(node.val));

    case "i32_wrap_i64": {
      const v = optimizeNode(node.val);
      if (v.op === "i64_extend_i32_s") return v.val;
      if (v.op === "convert" && v.kind === "i64_extend_i32_u") return v.val;
      if (v.op === "const_i64") return IR.const_i32(toI32(v.v));
      return IR.i32_wrap_i64(v);
    }

    case "i64_extend_i32_s": {
      const v = optimizeNode(node.val);
      if (v.op === "const_i32") return IR.const_i64(v.v);
      return IR.i64_extend_i32_s(v);
    }

    case "f64_convert_i32_s": {
      const v = optimizeNode(node.val);
      if (v.op === "const_i32") return IR.const_f64(v.v);
      return IR.f64_convert_i32_s(v);
    }

    case "i32_trunc_f64_s":
      return IR.i32_trunc_f64_s(optimizeNode(node.val));

    case "memory_grow":
      return IR.memory_grow(optimizeNode(node.pages));

    case "effect":
      return IR.effect(node.tag, optimizeNode(node.payload));

    case "call_indirect":
      return IR.call_indirect(node.typeIdx, node.tableIdx, node.args.map(optimizeNode), optimizeNode(node.indexExpr));

    // Leaf nodes — no children to optimize
    case "const_i32":
    case "const_i64":
    case "const_f32":
    case "const_f64":
    case "local_get":
    case "global_get":
    case "br":
    case "memory_size":
    case "unreachable":
    case "nop":
      return node;
  }
}

// --- Dead code elimination ---

function isTerminator(node: IRNode): boolean {
  return node.op === "br" || node.op === "return" || node.op === "unreachable";
}

function eliminateDeadCode(stmts: IRNode[]): IRNode[] {
  const result: IRNode[] = [];
  for (const stmt of stmts) {
    result.push(stmt);
    if (isTerminator(stmt)) break;
  }
  return result;
}

// --- Public API ---

export function optimizeFunc(body: IRNode[]): IRNode[] {
  let result = eliminateDeadCode(body.map(optimizeNode));
  // Second pass: cascade effects (e.g. constant fold → eqz inversion → branch elimination)
  result = eliminateDeadCode(result.map(optimizeNode));
  return result;
}
