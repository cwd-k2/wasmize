import { WasmEncoder } from "./encoder";
import { OP } from "./opcodes";
import { TYPE } from "./opcodes";
import { IR, type IRNode } from "./ir";

const binops: Record<string, number> = {
  add: OP.i32_add,
  sub: OP.i32_sub,
  mul: OP.i32_mul,
  div: OP.i32_div_s,
  rem: OP.i32_rem_s,
  and: OP.i32_and,
  or: OP.i32_or,
  xor: OP.i32_xor,
  shl: OP.i32_shl,
  shr: OP.i32_shr_s,
};

const cmps: Record<string, number> = {
  eq: OP.i32_eq,
  ne: OP.i32_ne,
  lt: OP.i32_lt_s,
  gt: OP.i32_gt_s,
  le: OP.i32_le_s,
  ge: OP.i32_ge_s,
};

export function emitIR(enc: WasmEncoder, node: IRNode | undefined): void {
  if (!node) return;
  switch (node.op) {
    case "const_i32":
      enc.byte(OP.i32_const);
      enc.i32(node.v);
      break;
    case "const_i64":
      enc.byte(OP.i64_const);
      enc.i64(node.v);
      break;
    case "local_get":
      enc.byte(OP.local_get);
      enc.u32(node.i);
      break;
    case "local_set":
      emitIR(enc, node.val);
      enc.byte(OP.local_set);
      enc.u32(node.i);
      break;
    case "local_tee":
      emitIR(enc, node.val);
      enc.byte(OP.local_tee);
      enc.u32(node.i);
      break;
    case "binop":
      emitIR(enc, node.a);
      emitIR(enc, node.b);
      enc.byte(binops[node.kind]!);
      break;
    case "cmp":
      emitIR(enc, node.a);
      emitIR(enc, node.b);
      enc.byte(cmps[node.kind]!);
      break;
    case "if":
      emitIR(enc, node.cond);
      enc.byte(OP.if_);
      enc.byte(node.type === "void" ? TYPE.void : TYPE.i32);
      node.then.forEach((n) => emitIR(enc, n));
      if (node.else && node.else.length) {
        enc.byte(OP.else_);
        node.else.forEach((n) => emitIR(enc, n));
      }
      enc.byte(OP.end);
      break;
    case "block":
      enc.byte(OP.block);
      enc.byte(TYPE.void);
      node.body.forEach((n) => emitIR(enc, n));
      enc.byte(OP.end);
      break;
    case "loop":
      enc.byte(OP.loop);
      enc.byte(TYPE.void);
      node.body.forEach((n) => emitIR(enc, n));
      enc.byte(OP.end);
      break;
    case "br_if":
      emitIR(enc, node.cond);
      enc.byte(OP.br_if);
      enc.u32(node.depth);
      break;
    case "br":
      enc.byte(OP.br);
      enc.u32(node.depth);
      break;
    case "call":
      (node.args || []).forEach((a) => emitIR(enc, a));
      enc.byte(OP.call);
      enc.u32(node.idx);
      break;
    case "drop":
      emitIR(enc, node.val);
      enc.byte(OP.drop);
      break;
    case "return":
      emitIR(enc, node.val);
      enc.byte(OP.return_);
      break;
    case "seq":
      node.stmts.forEach((n) => emitIR(enc, n));
      break;
    case "store_i32":
      emitIR(enc, node.addr);
      emitIR(enc, node.val);
      enc.byte(OP.i32_store);
      enc.byte(2);
      enc.u32(0);
      break;
    case "load_i32":
      emitIR(enc, node.addr);
      enc.byte(OP.i32_load);
      enc.byte(2);
      enc.u32(0);
      break;
    case "store_i32_8":
      emitIR(enc, node.addr);
      emitIR(enc, node.val);
      enc.byte(OP.i32_store8);
      enc.byte(0);
      enc.u32(0);
      break;
    case "load_i32_8u":
      emitIR(enc, node.addr);
      enc.byte(OP.i32_load8_u);
      enc.byte(0);
      enc.u32(0);
      break;
    case "eqz":
      emitIR(enc, node.val);
      enc.byte(OP.i32_eqz);
      break;
    case "nop":
      enc.byte(OP.nop);
      break;
    case "effect":
      emitIR(enc, IR.store_i32(IR.const_i32(0), IR.const_i32(node.tag)));
      emitIR(enc, IR.store_i32(IR.const_i32(4), node.payload));
      enc.byte(OP.i32_const);
      enc.i32(-1);
      enc.byte(OP.return_);
      break;
  }
}
