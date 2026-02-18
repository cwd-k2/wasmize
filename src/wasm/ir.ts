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
  | "shr";

export type CmpKind = "eq" | "ne" | "lt" | "gt" | "le" | "ge";

export type IRNode =
  | { op: "const_i32"; v: number }
  | { op: "const_i64"; v: number }
  | { op: "local_get"; i: number }
  | { op: "local_set"; i: number; val: IRNode }
  | { op: "local_tee"; i: number; val: IRNode }
  | { op: "binop"; kind: BinopKind; a: IRNode; b: IRNode }
  | { op: "cmp"; kind: CmpKind; a: IRNode; b: IRNode }
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
  | { op: "select"; a: IRNode; b: IRNode; cond: IRNode }
  | { op: "eqz"; val: IRNode }
  | { op: "nop" }
  | { op: "effect"; tag: number; payload: IRNode };

export const IR = {
  const_i32: (v: number): IRNode => ({ op: "const_i32", v }),
  const_i64: (v: number): IRNode => ({ op: "const_i64", v }),
  local_get: (i: number): IRNode => ({ op: "local_get", i }),
  local_set: (i: number, val: IRNode): IRNode => ({ op: "local_set", i, val }),
  local_tee: (i: number, val: IRNode): IRNode => ({ op: "local_tee", i, val }),
  binop: (kind: BinopKind, a: IRNode, b: IRNode): IRNode => ({
    op: "binop",
    kind,
    a,
    b,
  }),
  cmp: (kind: CmpKind, a: IRNode, b: IRNode): IRNode => ({
    op: "cmp",
    kind,
    a,
    b,
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
  select: (a: IRNode, b: IRNode, cond: IRNode): IRNode => ({ op: "select", a, b, cond }),
  eqz: (val: IRNode): IRNode => ({ op: "eqz", val }),
  nop: (): IRNode => ({ op: "nop" }),
  effect: (tag: number, payload: IRNode): IRNode => ({
    op: "effect",
    tag,
    payload,
  }),
};
