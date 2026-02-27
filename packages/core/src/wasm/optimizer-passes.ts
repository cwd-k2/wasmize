/**
 * Plugin-style optimizer passes with bottom-up tree walking.
 *
 * Provides the {@link OptimizerPass} interface and 9 builtin passes:
 * constant folding, strength reduction, algebraic simplification,
 * constant propagation, dead store elimination, branch simplification,
 * load-after-store forwarding, common subexpression elimination, and
 * double-negation elimination.
 *
 * {@link createOptimizer} composes passes into a single bottom-up
 * transform function. {@link visitChildren} enables recursive IR traversal.
 *
 * @module
 */
import type { IRNode, BinopKind, CmpKind, UnaryKind } from "./ir";
import { IR } from "./ir";
import type { WasmValType } from "./opcodes";

// ── Pass interface ──────────────────────────────────────────────────

/** A single optimization pass that transforms IR nodes bottom-up. */
export interface OptimizerPass {
  readonly name: string;
  /** Transforms a single IR node. Return the node unchanged to skip. */
  transform(node: IRNode): IRNode;
}

/** Configuration for the optimizer: which passes to apply and how many iterations. */
export interface OptimizerConfig {
  passes?: OptimizerPass[];
  /** Number of fixed-point iterations (default: 2). */
  iterations?: number;
}

// ── visitChildren ───────────────────────────────────────────────────

/** Maps each child of `node` through `visit`. Leaf nodes return unchanged. */
export function visitChildren(node: IRNode, visit: (n: IRNode) => IRNode): IRNode {
  switch (node.op) {
    // Leaf nodes
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

    // Single child (val)
    case "eqz":
      return IR.eqz(visit(node.val), node.type);
    case "unary":
      return IR.unary(node.kind, visit(node.val), node.type);
    case "convert":
      return IR.convert(node.kind, visit(node.val));
    case "local_set":
      return IR.local_set(node.i, visit(node.val));
    case "local_tee":
      return IR.local_tee(node.i, visit(node.val));
    case "drop":
      return IR.drop(visit(node.val));
    case "return":
      return IR.return_(visit(node.val));
    case "f64_neg":
      return IR.f64_neg(visit(node.val));
    case "f64_abs":
      return IR.f64_abs(visit(node.val));
    case "i32_wrap_i64":
      return IR.i32_wrap_i64(visit(node.val));
    case "i64_extend_i32_s":
      return IR.i64_extend_i32_s(visit(node.val));
    case "f64_convert_i32_s":
      return IR.f64_convert_i32_s(visit(node.val));
    case "i32_trunc_f64_s":
      return IR.i32_trunc_f64_s(visit(node.val));
    case "global_set":
      return IR.global_set(node.idx, visit(node.val));
    case "memory_grow":
      return IR.memory_grow(visit(node.pages));
    case "effect":
      return IR.effect(node.tag, visit(node.payload));

    // Single child (addr)
    case "load_i32":
      return IR.load_i32(visit(node.addr));
    case "load_i32_8u":
      return IR.load_i32_8u(visit(node.addr));
    case "load_i64":
      return IR.load_i64(visit(node.addr));
    case "load_f64":
      return IR.load_f64(visit(node.addr));
    case "mem_load":
      return IR.mem_load(node.kind, visit(node.addr));

    // Single child (cond/val)
    case "br_if":
      return IR.br_if(node.depth, visit(node.cond));
    case "br_table":
      return IR.br_table(node.labels, node.default_, visit(node.val));

    // Two children
    case "binop":
      return IR.binop(node.kind, visit(node.a), visit(node.b), node.type);
    case "cmp":
      return IR.cmp(node.kind, visit(node.a), visit(node.b), node.type);
    case "store_i32":
      return IR.store_i32(visit(node.addr), visit(node.val));
    case "store_i32_8":
      return IR.store_i32_8(visit(node.addr), visit(node.val));
    case "store_i64":
      return IR.store_i64(visit(node.addr), visit(node.val));
    case "store_f64":
      return IR.store_f64(visit(node.addr), visit(node.val));
    case "mem_store":
      return IR.mem_store(node.kind, visit(node.addr), visit(node.val));

    // Three children
    case "select":
      return IR.select(visit(node.a), visit(node.b), visit(node.cond));

    // Array children
    case "call":
      return IR.call(node.idx, node.args.map(visit));
    case "call_indirect":
      return IR.call_indirect(
        node.typeIdx,
        node.tableIdx,
        node.args.map(visit),
        visit(node.indexExpr),
      );
    case "if":
      return IR.if_then_else(
        visit(node.cond),
        node.then.map(visit),
        node.else.map(visit),
        node.type,
      );
    case "loop":
      return IR.loop(node.body.map(visit));
    case "block":
      return IR.block(node.body.map(visit));
    case "seq":
      return IR.seq(node.stmts.map(visit));

    // Bulk memory (three children)
    case "memory_copy":
      return IR.memory_copy(visit(node.dst), visit(node.src), visit(node.len));
    case "memory_fill":
      return IR.memory_fill(visit(node.dst), visit(node.val), visit(node.len));

    // Bulk-memory operations
    case "memory_init":
      return IR.memory_init(node.segIdx, visit(node.dst), visit(node.src), visit(node.len));
    case "data_drop":
      return node; // leaf node (no child IR nodes)

    // Tail calls
    case "return_call":
      return IR.return_call(node.idx, node.args.map(visit));
    case "return_call_indirect":
      return IR.return_call_indirect(
        node.typeIdx,
        node.tableIdx,
        node.args.map(visit),
        visit(node.indexExpr),
      );

    // Multi-value
    case "multi_value":
      return IR.multi_value(node.values.map(visit));

    // Stack-based local.set (no child value node)
    case "stack_local_set":
      return node;

    default: {
      const _exhaustive: never = node;
      return _exhaustive;
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function isPow2(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}

function log2(n: number): number {
  let r = 0;
  while (1 << r < n) r++;
  return r;
}

function toI32(v: number): number {
  return v | 0;
}

function irEqual(a: IRNode, b: IRNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function isIntZero(node: IRNode, type: WasmValType): boolean {
  return type === "i32"
    ? node.op === "const_i32" && node.v === 0
    : type === "i64"
      ? node.op === "const_i64" && node.v === 0
      : false;
}

function isIntOne(node: IRNode, type: WasmValType): boolean {
  return type === "i32"
    ? node.op === "const_i32" && node.v === 1
    : type === "i64"
      ? node.op === "const_i64" && node.v === 1
      : false;
}

function intConst(type: WasmValType, v: number): IRNode {
  return type === "i64" ? IR.const_i64(v) : IR.const_i32(v);
}

function intConstVal(node: IRNode, type: WasmValType): number | null {
  if (type === "i32" && node.op === "const_i32") return node.v;
  if (type === "i64" && node.op === "const_i64") return node.v;
  return null;
}

// ── i32 unary ops in JS ─────────────────────────────────────────────

function ctz32(v: number): number {
  if (v === 0) return 32;
  let n = 0;
  v = v | 0;
  while ((v & 1) === 0) {
    v >>>= 1;
    n++;
  }
  return n;
}

function popcnt32(v: number): number {
  v = v | 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function roundTiesToEven(v: number): number {
  const r = Math.round(v);
  if (Math.abs(v - r) === 0.5) return r % 2 === 0 ? r : r - Math.sign(v);
  return r;
}

// ── Constant folding helpers ────────────────────────────────────────

function foldUnary(kind: UnaryKind, v: number, type: WasmValType): number | null {
  if (type === "i32") {
    switch (kind) {
      case "clz":
        return Math.clz32(v);
      case "ctz":
        return ctz32(v);
      case "popcnt":
        return popcnt32(v);
      default:
        return null;
    }
  }
  if (type === "f64") {
    switch (kind) {
      case "neg":
        return -v;
      case "abs":
        return Math.abs(v);
      case "sqrt":
        return v >= 0 || isNaN(v) ? Math.sqrt(v) : NaN;
      case "ceil":
        return Math.ceil(v);
      case "floor":
        return Math.floor(v);
      case "trunc":
        return Math.trunc(v);
      case "nearest":
        return roundTiesToEven(v);
      default:
        return null;
    }
  }
  if (type === "f32") {
    switch (kind) {
      case "neg":
        return -v;
      case "abs":
        return Math.abs(v);
      case "sqrt":
        return Math.fround(Math.sqrt(v));
      case "ceil":
        return Math.fround(Math.ceil(v));
      case "floor":
        return Math.fround(Math.floor(v));
      case "trunc":
        return Math.fround(Math.trunc(v));
      case "nearest":
        return Math.fround(roundTiesToEven(v));
      default:
        return null;
    }
  }
  return null;
}

const invertCmp: Partial<Record<CmpKind, CmpKind>> = {
  lt: "ge",
  ge: "lt",
  gt: "le",
  le: "gt",
  eq: "ne",
  ne: "eq",
  lt_u: "ge_u",
  ge_u: "lt_u",
  gt_u: "le_u",
  le_u: "gt_u",
};

function foldBinop(kind: BinopKind, a: number, b: number): number | null {
  switch (kind) {
    case "add":
      return toI32(a + b);
    case "sub":
      return toI32(a - b);
    case "mul":
      return toI32(Math.imul(a, b));
    case "div":
      return b !== 0 ? toI32(a / b) : null;
    case "rem":
      return b !== 0 ? toI32(a % b) : null;
    case "div_u":
      return b !== 0 ? ((a >>> 0) / (b >>> 0)) | 0 : null;
    case "rem_u":
      return b !== 0 ? ((a >>> 0) % (b >>> 0)) | 0 : null;
    case "and":
      return a & b;
    case "or":
      return a | b;
    case "xor":
      return a ^ b;
    case "shl":
      return a << (b & 31);
    case "shr":
      return a >> (b & 31);
    case "shr_u":
      return (a >>> (b & 31)) | 0;
    case "rotl": {
      const s = b & 31;
      return (a << s) | (a >>> (32 - s)) | 0;
    }
    case "rotr": {
      const s = b & 31;
      return (a >>> s) | (a << (32 - s)) | 0;
    }
    default:
      return null;
  }
}

function foldCmp(kind: CmpKind, a: number, b: number): number {
  switch (kind) {
    case "eq":
      return a === b ? 1 : 0;
    case "ne":
      return a !== b ? 1 : 0;
    case "lt":
      return a < b ? 1 : 0;
    case "gt":
      return a > b ? 1 : 0;
    case "le":
      return a <= b ? 1 : 0;
    case "ge":
      return a >= b ? 1 : 0;
    case "lt_u":
      return a >>> 0 < b >>> 0 ? 1 : 0;
    case "gt_u":
      return a >>> 0 > b >>> 0 ? 1 : 0;
    case "le_u":
      return a >>> 0 <= b >>> 0 ? 1 : 0;
    case "ge_u":
      return a >>> 0 >= b >>> 0 ? 1 : 0;
  }
}

// ── Dead code elimination ───────────────────────────────────────────

function isTerminator(node: IRNode): boolean {
  return node.op === "br" || node.op === "return" || node.op === "unreachable";
}

export function eliminateDeadCode(stmts: IRNode[]): IRNode[] {
  const result: IRNode[] = [];
  for (const stmt of stmts) {
    result.push(stmt);
    if (isTerminator(stmt)) break;
  }
  return result;
}

// ── Builtin passes ──────────────────────────────────────────────────

/** Applies DCE to branch arrays, flattens seq, unwraps single-element blocks/seqs. */
const blockSimplification: OptimizerPass = {
  name: "block-simplification",
  transform(node) {
    switch (node.op) {
      case "if": {
        const then_ = eliminateDeadCode(node.then);
        const else_ = eliminateDeadCode(node.else);
        return IR.if_then_else(node.cond, then_, else_, node.type);
      }
      case "loop":
        return IR.loop(eliminateDeadCode(node.body));
      case "block": {
        const body = eliminateDeadCode(node.body);
        if (body.length === 1) {
          const s = body[0]!;
          if (
            s.op !== "if" &&
            s.op !== "loop" &&
            s.op !== "block" &&
            s.op !== "seq" &&
            s.op !== "br" &&
            s.op !== "br_if" &&
            s.op !== "br_table"
          )
            return s;
        }
        return IR.block(body);
      }
      case "seq": {
        const flat: IRNode[] = [];
        for (const s of node.stmts) {
          if (s.op === "seq") flat.push(...s.stmts);
          else flat.push(s);
        }
        const result = eliminateDeadCode(flat);
        if (result.length === 1) return result[0]!;
        return IR.seq(result);
      }
      default:
        return node;
    }
  },
};

/** Folds constant operands: binop(c,c), cmp(c,c), eqz(c), unary(c), convert(c), legacy nodes. */
const constantFolding: OptimizerPass = {
  name: "constant-folding",
  transform(node) {
    switch (node.op) {
      case "binop": {
        const type = node.type || "i32";
        if (type === "i32" && node.a.op === "const_i32" && node.b.op === "const_i32") {
          const result = foldBinop(node.kind, node.a.v, node.b.v);
          if (result !== null) return IR.const_i32(result);
        }
        return node;
      }
      case "cmp": {
        const type = node.type || "i32";
        if (type === "i32" && node.a.op === "const_i32" && node.b.op === "const_i32") {
          return IR.const_i32(foldCmp(node.kind, node.a.v, node.b.v));
        }
        // Unsigned comparisons with zero
        if (type === "i32") {
          if (node.kind === "lt_u" && node.b.op === "const_i32" && node.b.v === 0)
            return IR.const_i32(0);
          if (node.kind === "ge_u" && node.b.op === "const_i32" && node.b.v === 0)
            return IR.const_i32(1);
          if (node.kind === "gt_u" && node.a.op === "const_i32" && node.a.v === 0)
            return IR.const_i32(0);
          if (node.kind === "le_u" && node.a.op === "const_i32" && node.a.v === 0)
            return IR.const_i32(1);
        }
        return node;
      }
      case "eqz": {
        const type = node.type || "i32";
        if (type === "i32" && node.val.op === "const_i32") {
          return IR.const_i32(node.val.v === 0 ? 1 : 0);
        }
        return node;
      }
      case "unary": {
        const type = node.type || "i32";
        if (type === "i32" && node.val.op === "const_i32") {
          const r = foldUnary(node.kind, node.val.v, "i32");
          if (r !== null) return IR.const_i32(r);
        }
        if (type === "f64" && node.val.op === "const_f64") {
          const r = foldUnary(node.kind, node.val.v, "f64");
          if (r !== null) return IR.const_f64(r);
        }
        if (type === "f32" && node.val.op === "const_f32") {
          const r = foldUnary(node.kind, node.val.v, "f32");
          if (r !== null) return IR.const_f32(r);
        }
        return node;
      }
      case "convert": {
        const v = node.val;
        if (node.kind === "i32_wrap_i64" && v.op === "const_i64") return IR.const_i32(toI32(v.v));
        if (node.kind === "i64_extend_i32_s" && v.op === "const_i32") return IR.const_i64(v.v);
        if (node.kind === "i64_extend_i32_u" && v.op === "const_i32")
          return IR.const_i64(v.v >>> 0);
        if (node.kind === "f64_convert_i32_s" && v.op === "const_i32") return IR.const_f64(v.v);
        if (node.kind === "f64_convert_i32_u" && v.op === "const_i32")
          return IR.const_f64(v.v >>> 0);
        if (node.kind === "f32_convert_i32_s" && v.op === "const_i32")
          return IR.const_f32(Math.fround(v.v));
        if (node.kind === "f64_promote_f32" && v.op === "const_f32") return IR.const_f64(v.v);
        if (node.kind === "f32_demote_f64" && v.op === "const_f64")
          return IR.const_f32(Math.fround(v.v));
        if (node.kind === "i32_trunc_f64_s" && v.op === "const_f64") {
          const t = Math.trunc(v.v);
          if (Number.isFinite(t) && t >= -2147483648 && t <= 2147483647) return IR.const_i32(t);
        }
        if (node.kind === "i32_trunc_f32_s" && v.op === "const_f32") {
          const t = Math.trunc(v.v);
          if (Number.isFinite(t) && t >= -2147483648 && t <= 2147483647) return IR.const_i32(t);
        }
        return node;
      }
      // Legacy nodes: constant folding
      case "f64_neg":
        if (node.val.op === "const_f64") return IR.const_f64(-node.val.v);
        return node;
      case "f64_abs":
        if (node.val.op === "const_f64") return IR.const_f64(Math.abs(node.val.v));
        return node;
      case "i32_wrap_i64":
        if (node.val.op === "const_i64") return IR.const_i32(toI32(node.val.v));
        return node;
      case "i64_extend_i32_s":
        if (node.val.op === "const_i32") return IR.const_i64(node.val.v);
        return node;
      case "f64_convert_i32_s":
        if (node.val.op === "const_i32") return IR.const_f64(node.val.v);
        return node;
      case "i32_trunc_f64_s": {
        if (node.val.op === "const_f64") {
          const t = Math.trunc(node.val.v);
          if (Number.isFinite(t) && t >= -2147483648 && t <= 2147483647) return IR.const_i32(t);
        }
        return node;
      }
      default:
        return node;
    }
  },
};

/** Eliminates identity operations: x+0→x, x*1→x, etc. */
const identityElimination: OptimizerPass = {
  name: "identity-elimination",
  transform(node) {
    if (node.op !== "binop") return node;
    const type = node.type || "i32";
    if (type !== "i32" && type !== "i64") return node;

    switch (node.kind) {
      case "add":
        if (isIntZero(node.b, type)) return node.a;
        if (isIntZero(node.a, type)) return node.b;
        break;
      case "sub":
        if (isIntZero(node.b, type)) return node.a;
        break;
      case "mul":
        if (isIntOne(node.b, type)) return node.a;
        if (isIntOne(node.a, type)) return node.b;
        if (isIntZero(node.b, type)) return intConst(type, 0);
        if (isIntZero(node.a, type)) return intConst(type, 0);
        break;
      case "or":
      case "xor":
        if (isIntZero(node.b, type)) return node.a;
        if (isIntZero(node.a, type)) return node.b;
        break;
      case "and":
        if (isIntZero(node.b, type)) return intConst(type, 0);
        if (isIntZero(node.a, type)) return intConst(type, 0);
        break;
      case "shl":
      case "shr":
      case "shr_u":
        if (isIntZero(node.b, type)) return node.a;
        break;
    }
    return node;
  },
};

/** Eliminates self-cancelling: x-x→0, x^x→0. */
const selfCancelling: OptimizerPass = {
  name: "self-cancelling",
  transform(node) {
    if (node.op !== "binop") return node;
    const type = node.type || "i32";
    if (type !== "i32" && type !== "i64") return node;
    if ((node.kind === "sub" || node.kind === "xor") && irEqual(node.a, node.b)) {
      return intConst(type, 0);
    }
    return node;
  },
};

/** Reduces mul→shl, div_u→shr_u, rem_u→and for power-of-2 constants. */
const strengthReduction: OptimizerPass = {
  name: "strength-reduction",
  transform(node) {
    if (node.op !== "binop") return node;
    const type = node.type || "i32";
    if (type !== "i32" && type !== "i64") return node;

    if (node.kind === "mul") {
      const bv = intConstVal(node.b, type);
      if (bv !== null && isPow2(bv))
        return IR.binop("shl", node.a, intConst(type, log2(bv)), node.type);
      const av = intConstVal(node.a, type);
      if (av !== null && isPow2(av))
        return IR.binop("shl", node.b, intConst(type, log2(av)), node.type);
    }

    if (node.kind === "div_u") {
      const bv = intConstVal(node.b, type);
      if (bv !== null && isPow2(bv))
        return IR.binop("shr_u", node.a, intConst(type, log2(bv)), node.type);
    }

    if (node.kind === "rem_u") {
      const bv = intConstVal(node.b, type);
      if (bv !== null && isPow2(bv))
        return IR.binop("and", node.a, intConst(type, bv - 1), node.type);
    }

    return node;
  },
};

/** Inverts eqz(cmp)→inverted cmp, eliminates eqz(eqz(boolean)). */
const comparisonInversion: OptimizerPass = {
  name: "comparison-inversion",
  transform(node) {
    if (node.op !== "eqz") return node;
    const type = node.type || "i32";
    if (type !== "i32") return node;

    // eqz(cmp(kind, a, b)) → cmp(inverted_kind, a, b)
    if (node.val.op === "cmp") {
      const inv = invertCmp[node.val.kind];
      if (inv) return IR.cmp(inv, node.val.a, node.val.b, node.val.type);
    }

    // eqz(eqz(x)) → x (when x is boolean: cmp or eqz result)
    if (node.val.op === "eqz") {
      const inner = node.val.val;
      if (inner.op === "cmp" || inner.op === "eqz") return inner;
    }

    return node;
  },
};

/** Eliminates convert round-trips: wrap(extend(x))→x, etc. */
const roundTripElimination: OptimizerPass = {
  name: "round-trip-elimination",
  transform(node) {
    switch (node.op) {
      case "convert": {
        const v = node.val;
        if (node.kind === "i32_wrap_i64") {
          if (v.op === "i64_extend_i32_s") return v.val;
          if (v.op === "convert" && v.kind === "i64_extend_i32_u") return v.val;
        }
        return node;
      }
      case "i32_wrap_i64": {
        if (node.val.op === "i64_extend_i32_s") return node.val.val;
        if (node.val.op === "convert" && node.val.kind === "i64_extend_i32_u") return node.val.val;
        return node;
      }
      default:
        return node;
    }
  },
};

/** Simplifies neg(neg(x))→x, abs(abs(x))→abs(x). */
const algebraicSimplification: OptimizerPass = {
  name: "algebraic-simplification",
  transform(node) {
    if (node.op !== "unary") return node;
    if (node.kind === "neg" && node.val.op === "unary" && node.val.kind === "neg") {
      return node.val.val;
    }
    if (node.kind === "abs" && node.val.op === "unary" && node.val.kind === "abs") {
      return node.val;
    }
    return node;
  },
};

/** Eliminates if/select/br_if with constant conditions. */
const conditionElimination: OptimizerPass = {
  name: "condition-elimination",
  transform(node) {
    switch (node.op) {
      case "if": {
        if (node.cond.op === "const_i32") {
          const taken = node.cond.v !== 0 ? node.then : node.else;
          if (taken.length === 0) return IR.nop();
          if (taken.length === 1) return taken[0]!;
          return IR.seq(taken);
        }
        return node;
      }
      case "select": {
        if (node.cond.op === "const_i32") {
          return node.cond.v !== 0 ? node.a : node.b;
        }
        return node;
      }
      case "br_if": {
        if (node.cond.op === "const_i32") {
          return node.cond.v !== 0 ? IR.br(node.depth) : IR.nop();
        }
        return node;
      }
      default:
        return node;
    }
  },
};

/** Callback type for reporting optimizer warnings (e.g. overflow detection). */
export type OptimizerWarningCallback = (message: string) => void;

/**
 * Creates a constant-folding pass that reports i32 overflow warnings.
 * When the raw arithmetic result exceeds i32 range before wrapping, the
 * callback is invoked with a descriptive message.
 */
export function createConstantFoldingWithWarnings(warn: OptimizerWarningCallback): OptimizerPass {
  return {
    name: "constant-folding",
    transform(node) {
      // Delegate to the regular constant-folding logic, but check for overflow on binop
      if (node.op === "binop") {
        const type = node.type || "i32";
        if (type === "i32" && node.a.op === "const_i32" && node.b.op === "const_i32") {
          const rawResult = foldBinopRaw(node.kind, node.a.v, node.b.v);
          if (rawResult !== null && (rawResult > 2147483647 || rawResult < -2147483648)) {
            warn(
              `Constant fold overflow: ${node.kind}(${node.a.v}, ${node.b.v}) = ${rawResult} (wraps to ${toI32(rawResult)})`,
            );
          }
        }
      }
      return constantFolding.transform(node);
    },
  };
}

/** Raw (unwrapped) binary operation for overflow detection. */
function foldBinopRaw(kind: BinopKind, a: number, b: number): number | null {
  switch (kind) {
    case "add":
      return a + b;
    case "sub":
      return a - b;
    case "mul":
      return a * b;
    default:
      return null;
  }
}

// ── Builtin pass list ───────────────────────────────────────────────

export const builtinPasses: readonly OptimizerPass[] = [
  blockSimplification,
  constantFolding,
  identityElimination,
  selfCancelling,
  strengthReduction,
  comparisonInversion,
  roundTripElimination,
  algebraicSimplification,
  conditionElimination,
];

// ── Optimizer factory ───────────────────────────────────────────────

/** Creates a bottom-up optimizer: visits children first, then chains passes. */
export function createOptimizer(passes: readonly OptimizerPass[]): (node: IRNode) => IRNode {
  function optimize(node: IRNode): IRNode {
    let result = visitChildren(node, optimize);
    for (const pass of passes) {
      result = pass.transform(result);
    }
    return result;
  }
  return optimize;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Returns builtinPasses with named passes removed. */
export function withoutPasses(names: string[]): OptimizerPass[] {
  const set = new Set(names);
  return builtinPasses.filter((p) => !set.has(p.name));
}
