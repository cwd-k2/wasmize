import type { WasmValType } from "./opcodes";

export type BinopKind =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "rem"
  | "and"
  | "or"
  | "xor"
  | "shl"
  | "shr"
  | "div_u"
  | "rem_u"
  | "shr_u";

export type CmpKind = "eq" | "ne" | "lt" | "gt" | "le" | "ge" | "lt_u" | "gt_u" | "le_u" | "ge_u";

export type IRNode =
  | { op: "const_i32"; v: number }
  | { op: "const_i64"; v: number }
  | { op: "const_f64"; v: number }
  | { op: "local_get"; i: number }
  | { op: "local_set"; i: number; val: IRNode }
  | { op: "local_tee"; i: number; val: IRNode }
  | { op: "binop"; kind: BinopKind; a: IRNode; b: IRNode; type?: WasmValType }
  | { op: "cmp"; kind: CmpKind; a: IRNode; b: IRNode; type?: WasmValType }
  | {
      op: "if";
      cond: IRNode;
      then: IRNode[];
      else: IRNode[];
      type: string;
    }
  | { op: "loop"; body: IRNode[] }
  | { op: "br_if"; depth: number; cond: IRNode }
  | { op: "br"; depth: number }
  | { op: "block"; body: IRNode[] }
  | { op: "seq"; stmts: IRNode[] }
  | { op: "call"; idx: number; args: IRNode[] }
  | { op: "drop"; val: IRNode }
  | { op: "return"; val: IRNode }
  | { op: "store_i32"; addr: IRNode; val: IRNode }
  | { op: "load_i32"; addr: IRNode }
  | { op: "store_i32_8"; addr: IRNode; val: IRNode }
  | { op: "load_i32_8u"; addr: IRNode }
  | { op: "load_i64"; addr: IRNode }
  | { op: "store_i64"; addr: IRNode; val: IRNode }
  | { op: "load_f64"; addr: IRNode }
  | { op: "store_f64"; addr: IRNode; val: IRNode }
  | { op: "select"; a: IRNode; b: IRNode; cond: IRNode }
  | { op: "eqz"; val: IRNode; type?: WasmValType }
  | { op: "f64_neg"; val: IRNode }
  | { op: "f64_abs"; val: IRNode }
  | { op: "i32_wrap_i64"; val: IRNode }
  | { op: "i64_extend_i32_s"; val: IRNode }
  | { op: "f64_convert_i32_s"; val: IRNode }
  | { op: "i32_trunc_f64_s"; val: IRNode }
  | { op: "memory_size" }
  | { op: "memory_grow"; pages: IRNode }
  | { op: "unreachable" }
  | { op: "nop" }
  | { op: "effect"; tag: number; payload: IRNode };

export const IR = {
  const_i32: (v: number): IRNode => ({ op: "const_i32", v }),
  const_i64: (v: number): IRNode => ({ op: "const_i64", v }),
  const_f64: (v: number): IRNode => ({ op: "const_f64", v }),
  local_get: (i: number): IRNode => ({ op: "local_get", i }),
  local_set: (i: number, val: IRNode): IRNode => ({ op: "local_set", i, val }),
  local_tee: (i: number, val: IRNode): IRNode => ({ op: "local_tee", i, val }),
  binop: (kind: BinopKind, a: IRNode, b: IRNode, type?: WasmValType): IRNode => ({
    op: "binop",
    kind,
    a,
    b,
    ...(type && type !== "i32" ? { type } : {}),
  }),
  cmp: (kind: CmpKind, a: IRNode, b: IRNode, type?: WasmValType): IRNode => ({
    op: "cmp",
    kind,
    a,
    b,
    ...(type && type !== "i32" ? { type } : {}),
  }),
  if_then_else: (
    cond: IRNode,
    then_: IRNode[],
    else_: IRNode[],
    type?: string,
  ): IRNode => ({
    op: "if",
    cond,
    then: then_,
    else: else_,
    type: type || "i32",
  }),
  loop: (body: IRNode[]): IRNode => ({ op: "loop", body }),
  br_if: (depth: number, cond: IRNode): IRNode => ({
    op: "br_if",
    depth,
    cond,
  }),
  br: (depth: number): IRNode => ({ op: "br", depth }),
  block: (body: IRNode[]): IRNode => ({ op: "block", body }),
  seq: (stmts: IRNode[]): IRNode => ({ op: "seq", stmts }),
  call: (idx: number, args: IRNode[]): IRNode => ({ op: "call", idx, args }),
  drop: (val: IRNode): IRNode => ({ op: "drop", val }),
  return_: (val: IRNode): IRNode => ({ op: "return", val }),
  store_i32: (addr: IRNode, val: IRNode): IRNode => ({
    op: "store_i32",
    addr,
    val,
  }),
  load_i32: (addr: IRNode): IRNode => ({ op: "load_i32", addr }),
  store_i32_8: (addr: IRNode, val: IRNode): IRNode => ({
    op: "store_i32_8",
    addr,
    val,
  }),
  load_i32_8u: (addr: IRNode): IRNode => ({ op: "load_i32_8u", addr }),
  load_i64: (addr: IRNode): IRNode => ({ op: "load_i64", addr }),
  store_i64: (addr: IRNode, val: IRNode): IRNode => ({ op: "store_i64", addr, val }),
  load_f64: (addr: IRNode): IRNode => ({ op: "load_f64", addr }),
  store_f64: (addr: IRNode, val: IRNode): IRNode => ({ op: "store_f64", addr, val }),
  select: (a: IRNode, b: IRNode, cond: IRNode): IRNode => ({ op: "select", a, b, cond }),
  eqz: (val: IRNode, type?: WasmValType): IRNode => ({
    op: "eqz",
    val,
    ...(type && type !== "i32" ? { type } : {}),
  }),
  f64_neg: (val: IRNode): IRNode => ({ op: "f64_neg", val }),
  f64_abs: (val: IRNode): IRNode => ({ op: "f64_abs", val }),
  i32_wrap_i64: (val: IRNode): IRNode => ({ op: "i32_wrap_i64", val }),
  i64_extend_i32_s: (val: IRNode): IRNode => ({ op: "i64_extend_i32_s", val }),
  f64_convert_i32_s: (val: IRNode): IRNode => ({ op: "f64_convert_i32_s", val }),
  i32_trunc_f64_s: (val: IRNode): IRNode => ({ op: "i32_trunc_f64_s", val }),
  memory_size: (): IRNode => ({ op: "memory_size" }),
  memory_grow: (pages: IRNode): IRNode => ({ op: "memory_grow", pages }),
  unreachable: (): IRNode => ({ op: "unreachable" }),
  nop: (): IRNode => ({ op: "nop" }),
  effect: (tag: number, payload: IRNode): IRNode => ({
    op: "effect",
    tag,
    payload,
  }),
};
