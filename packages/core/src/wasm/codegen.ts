/**
 * IR → Wasm binary code emission.
 *
 * Translates {@link IRNode} trees into Wasm bytecode via {@link emitIR}.
 * Uses 2D dispatch tables (`binopTable`, `cmpTable`, `unaryTable`) to map
 * `(type, kind)` pairs to Wasm opcodes, enabling polymorphic i32/i64/f32/f64
 * support without branching in the hot path.
 *
 * @module
 */
import { WasmEncoder } from "./encoder";
import { OP } from "./opcodes";
import { TYPE } from "./opcodes";
import type { WasmValType } from "./opcodes";
import { IR, type IRNode } from "./ir";

// --- 2D dispatch tables ---

const binopTable: Record<string, Record<string, number>> = {
  i32: {
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
    div_u: OP.i32_div_u,
    rem_u: OP.i32_rem_u,
    shr_u: OP.i32_shr_u,
    rotl: OP.i32_rotl,
    rotr: OP.i32_rotr,
  },
  i64: {
    add: OP.i64_add,
    sub: OP.i64_sub,
    mul: OP.i64_mul,
    div: OP.i64_div_s,
    rem: OP.i64_rem_s,
    and: OP.i64_and,
    or: OP.i64_or,
    xor: OP.i64_xor,
    shl: OP.i64_shl,
    shr: OP.i64_shr_s,
    div_u: OP.i64_div_u,
    rem_u: OP.i64_rem_u,
    shr_u: OP.i64_shr_u,
    rotl: OP.i64_rotl,
    rotr: OP.i64_rotr,
  },
  f32: {
    add: OP.f32_add,
    sub: OP.f32_sub,
    mul: OP.f32_mul,
    div: OP.f32_div,
    min: OP.f32_min,
    max: OP.f32_max,
    copysign: OP.f32_copysign,
  },
  f64: {
    add: OP.f64_add,
    sub: OP.f64_sub,
    mul: OP.f64_mul,
    div: OP.f64_div,
    min: OP.f64_min,
    max: OP.f64_max,
    copysign: OP.f64_copysign,
  },
};

const cmpTable: Record<string, Record<string, number>> = {
  i32: {
    eq: OP.i32_eq,
    ne: OP.i32_ne,
    lt: OP.i32_lt_s,
    gt: OP.i32_gt_s,
    le: OP.i32_le_s,
    ge: OP.i32_ge_s,
    lt_u: OP.i32_lt_u,
    gt_u: OP.i32_gt_u,
    le_u: OP.i32_le_u,
    ge_u: OP.i32_ge_u,
  },
  i64: {
    eq: OP.i64_eq,
    ne: OP.i64_ne,
    lt: OP.i64_lt_s,
    gt: OP.i64_gt_s,
    le: OP.i64_le_s,
    ge: OP.i64_ge_s,
    lt_u: OP.i64_lt_u,
    gt_u: OP.i64_gt_u,
    le_u: OP.i64_le_u,
    ge_u: OP.i64_ge_u,
  },
  f32: {
    eq: OP.f32_eq,
    ne: OP.f32_ne,
    lt: OP.f32_lt,
    gt: OP.f32_gt,
    le: OP.f32_le,
    ge: OP.f32_ge,
  },
  f64: {
    eq: OP.f64_eq,
    ne: OP.f64_ne,
    lt: OP.f64_lt,
    gt: OP.f64_gt,
    le: OP.f64_le,
    ge: OP.f64_ge,
  },
};

const unaryTable: Record<string, Record<string, number>> = {
  i32: { clz: OP.i32_clz, ctz: OP.i32_ctz, popcnt: OP.i32_popcnt },
  i64: { clz: OP.i64_clz, ctz: OP.i64_ctz, popcnt: OP.i64_popcnt },
  f32: {
    abs: OP.f32_abs,
    neg: OP.f32_neg,
    ceil: OP.f32_ceil,
    floor: OP.f32_floor,
    trunc: OP.f32_trunc,
    nearest: OP.f32_nearest,
    sqrt: OP.f32_sqrt,
  },
  f64: {
    abs: OP.f64_abs,
    neg: OP.f64_neg,
    ceil: OP.f64_ceil,
    floor: OP.f64_floor,
    trunc: OP.f64_trunc,
    nearest: OP.f64_nearest,
    sqrt: OP.f64_sqrt,
  },
};

const convertTable: Record<string, number> = {
  i32_wrap_i64: OP.i32_wrap_i64,
  i32_trunc_f32_s: OP.i32_trunc_f32_s,
  i32_trunc_f32_u: OP.i32_trunc_f32_u,
  i32_trunc_f64_s: OP.i32_trunc_f64_s,
  i32_trunc_f64_u: OP.i32_trunc_f64_u,
  i64_extend_i32_s: OP.i64_extend_i32_s,
  i64_extend_i32_u: OP.i64_extend_i32_u,
  i64_trunc_f32_s: OP.i64_trunc_f32_s,
  i64_trunc_f32_u: OP.i64_trunc_f32_u,
  i64_trunc_f64_s: OP.i64_trunc_f64_s,
  i64_trunc_f64_u: OP.i64_trunc_f64_u,
  f32_convert_i32_s: OP.f32_convert_i32_s,
  f32_convert_i32_u: OP.f32_convert_i32_u,
  f32_convert_i64_s: OP.f32_convert_i64_s,
  f32_convert_i64_u: OP.f32_convert_i64_u,
  f32_demote_f64: OP.f32_demote_f64,
  f64_convert_i32_s: OP.f64_convert_i32_s,
  f64_convert_i32_u: OP.f64_convert_i32_u,
  f64_convert_i64_s: OP.f64_convert_i64_s,
  f64_convert_i64_u: OP.f64_convert_i64_u,
  f64_promote_f32: OP.f64_promote_f32,
  i32_reinterpret_f32: OP.i32_reinterpret_f32,
  i64_reinterpret_f64: OP.i64_reinterpret_f64,
  f32_reinterpret_i32: OP.f32_reinterpret_i32,
  f64_reinterpret_i64: OP.f64_reinterpret_i64,
  // Sign-extension
  i32_extend8_s: OP.i32_extend8_s,
  i32_extend16_s: OP.i32_extend16_s,
  i64_extend8_s: OP.i64_extend8_s,
  i64_extend16_s: OP.i64_extend16_s,
  i64_extend32_s: OP.i64_extend32_s,
};

const memLoadInfo: Record<string, { opcode: number; align: number }> = {
  f32_load: { opcode: OP.f32_load, align: 2 },
  i32_load8_s: { opcode: OP.i32_load8_s, align: 0 },
  i32_load16_s: { opcode: OP.i32_load16_s, align: 1 },
  i32_load16_u: { opcode: OP.i32_load16_u, align: 1 },
  i64_load8_s: { opcode: OP.i64_load8_s, align: 0 },
  i64_load8_u: { opcode: OP.i64_load8_u, align: 0 },
  i64_load16_s: { opcode: OP.i64_load16_s, align: 1 },
  i64_load16_u: { opcode: OP.i64_load16_u, align: 1 },
  i64_load32_s: { opcode: OP.i64_load32_s, align: 2 },
  i64_load32_u: { opcode: OP.i64_load32_u, align: 2 },
};

const memStoreInfo: Record<string, { opcode: number; align: number }> = {
  f32_store: { opcode: OP.f32_store, align: 2 },
  i32_store16: { opcode: OP.i32_store16, align: 1 },
  i64_store8: { opcode: OP.i64_store8, align: 0 },
  i64_store16: { opcode: OP.i64_store16, align: 1 },
  i64_store32: { opcode: OP.i64_store32, align: 2 },
};

function extractOffset(addr: IRNode): { base: IRNode; offset: number } {
  if (addr.op === "binop" && addr.kind === "add") {
    if (addr.b.op === "const_i32" && addr.b.v >= 0) return { base: addr.a, offset: addr.b.v };
    if (addr.a.op === "const_i32" && addr.a.v >= 0) return { base: addr.b, offset: addr.a.v };
  }
  if (addr.op === "const_i32" && addr.v >= 0) return { base: IR.const_i32(0), offset: addr.v };
  return { base: addr, offset: 0 };
}

/** Emits Wasm bytecode for an IR node tree into the encoder. Recursively processes children. */
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
    case "const_f32":
      enc.byte(OP.f32_const);
      enc.f32(node.v);
      break;
    case "const_f64":
      enc.byte(OP.f64_const);
      enc.f64(node.v);
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
      enc.byte(binopTable[node.type || "i32"]![node.kind]!);
      break;
    case "cmp":
      emitIR(enc, node.a);
      emitIR(enc, node.b);
      enc.byte(cmpTable[node.type || "i32"]![node.kind]!);
      break;
    case "unary":
      emitIR(enc, node.val);
      enc.byte(unaryTable[node.type || "i32"]![node.kind]!);
      break;
    case "convert":
      emitIR(enc, node.val);
      enc.byte(convertTable[node.kind]!);
      break;
    case "if":
      emitIR(enc, node.cond);
      enc.byte(OP.if_);
      enc.byte(TYPE[node.type as WasmValType | "void"] ?? TYPE.i32);
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
    case "br_table":
      emitIR(enc, node.val);
      enc.byte(OP.br_table);
      enc.u32(node.labels.length);
      for (const l of node.labels) enc.u32(l);
      enc.u32(node.default_);
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
    case "store_i32": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      emitIR(enc, node.val);
      enc.byte(OP.i32_store);
      enc.byte(2);
      enc.u32(offset);
      break;
    }
    case "load_i32": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      enc.byte(OP.i32_load);
      enc.byte(2);
      enc.u32(offset);
      break;
    }
    case "store_i32_8": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      emitIR(enc, node.val);
      enc.byte(OP.i32_store8);
      enc.byte(0);
      enc.u32(offset);
      break;
    }
    case "load_i32_8u": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      enc.byte(OP.i32_load8_u);
      enc.byte(0);
      enc.u32(offset);
      break;
    }
    case "load_i64": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      enc.byte(OP.i64_load);
      enc.byte(3);
      enc.u32(offset);
      break;
    }
    case "store_i64": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      emitIR(enc, node.val);
      enc.byte(OP.i64_store);
      enc.byte(3);
      enc.u32(offset);
      break;
    }
    case "load_f64": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      enc.byte(OP.f64_load);
      enc.byte(3);
      enc.u32(offset);
      break;
    }
    case "store_f64": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      emitIR(enc, node.val);
      enc.byte(OP.f64_store);
      enc.byte(3);
      enc.u32(offset);
      break;
    }
    case "mem_load": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      const info = memLoadInfo[node.kind]!;
      enc.byte(info.opcode);
      enc.byte(info.align);
      enc.u32(offset);
      break;
    }
    case "mem_store": {
      const { base, offset } = extractOffset(node.addr);
      emitIR(enc, base);
      emitIR(enc, node.val);
      const info = memStoreInfo[node.kind]!;
      enc.byte(info.opcode);
      enc.byte(info.align);
      enc.u32(offset);
      break;
    }
    case "select":
      emitIR(enc, node.a);
      emitIR(enc, node.b);
      emitIR(enc, node.cond);
      enc.byte(OP.select);
      break;
    case "eqz":
      emitIR(enc, node.val);
      enc.byte(node.type === "i64" ? OP.i64_eqz : OP.i32_eqz);
      break;
    case "f64_neg":
      emitIR(enc, node.val);
      enc.byte(OP.f64_neg);
      break;
    case "f64_abs":
      emitIR(enc, node.val);
      enc.byte(OP.f64_abs);
      break;
    case "i32_wrap_i64":
      emitIR(enc, node.val);
      enc.byte(OP.i32_wrap_i64);
      break;
    case "i64_extend_i32_s":
      emitIR(enc, node.val);
      enc.byte(OP.i64_extend_i32_s);
      break;
    case "f64_convert_i32_s":
      emitIR(enc, node.val);
      enc.byte(OP.f64_convert_i32_s);
      break;
    case "i32_trunc_f64_s":
      emitIR(enc, node.val);
      enc.byte(OP.i32_trunc_f64_s);
      break;
    case "global_get":
      enc.byte(OP.global_get);
      enc.u32(node.idx);
      break;
    case "global_set":
      emitIR(enc, node.val);
      enc.byte(OP.global_set);
      enc.u32(node.idx);
      break;
    case "memory_size":
      enc.byte(OP.memory_size);
      enc.byte(0x00);
      break;
    case "memory_grow":
      emitIR(enc, node.pages);
      enc.byte(OP.memory_grow);
      enc.byte(0x00);
      break;
    case "unreachable":
      enc.byte(OP.unreachable);
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
    case "call_indirect":
      (node.args || []).forEach((a) => emitIR(enc, a));
      emitIR(enc, node.indexExpr);
      enc.byte(OP.call_indirect);
      enc.u32(node.typeIdx);
      enc.u32(node.tableIdx);
      break;
    case "memory_copy":
      emitIR(enc, node.dst);
      emitIR(enc, node.src);
      emitIR(enc, node.len);
      enc.byte(OP.fc_prefix);
      enc.u32(OP.memory_copy);
      enc.byte(0x00); // src memory index
      enc.byte(0x00); // dst memory index
      break;
    case "memory_fill":
      emitIR(enc, node.dst);
      emitIR(enc, node.val);
      emitIR(enc, node.len);
      enc.byte(OP.fc_prefix);
      enc.u32(OP.memory_fill);
      enc.byte(0x00); // memory index
      break;
  }
}
