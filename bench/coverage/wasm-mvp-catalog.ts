export type Category =
  | "control"
  | "parametric"
  | "variable"
  | "memory_load"
  | "memory_store"
  | "memory_misc"
  | "i32_numeric"
  | "i64_numeric"
  | "f32_numeric"
  | "f64_numeric"
  | "type_conversion";

export interface WasmInstruction {
  name: string;
  opcode: number;
  category: Category;
}

export const WASM_MVP_CATALOG: WasmInstruction[] = [
  // ── Control ──
  { name: "unreachable",     opcode: 0x00, category: "control" },
  { name: "nop",             opcode: 0x01, category: "control" },
  { name: "block",           opcode: 0x02, category: "control" },
  { name: "loop",            opcode: 0x03, category: "control" },
  { name: "if",              opcode: 0x04, category: "control" },
  { name: "else",            opcode: 0x05, category: "control" },
  { name: "end",             opcode: 0x0b, category: "control" },
  { name: "br",              opcode: 0x0c, category: "control" },
  { name: "br_if",           opcode: 0x0d, category: "control" },
  { name: "br_table",        opcode: 0x0e, category: "control" },
  { name: "return",          opcode: 0x0f, category: "control" },
  { name: "call",            opcode: 0x10, category: "control" },
  { name: "call_indirect",   opcode: 0x11, category: "control" },

  // ── Parametric ──
  { name: "drop",            opcode: 0x1a, category: "parametric" },
  { name: "select",          opcode: 0x1b, category: "parametric" },

  // ── Variable ──
  { name: "local.get",       opcode: 0x20, category: "variable" },
  { name: "local.set",       opcode: 0x21, category: "variable" },
  { name: "local.tee",       opcode: 0x22, category: "variable" },
  { name: "global.get",      opcode: 0x23, category: "variable" },
  { name: "global.set",      opcode: 0x24, category: "variable" },

  // ── Memory Load ──
  { name: "i32.load",        opcode: 0x28, category: "memory_load" },
  { name: "i64.load",        opcode: 0x29, category: "memory_load" },
  { name: "f32.load",        opcode: 0x2a, category: "memory_load" },
  { name: "f64.load",        opcode: 0x2b, category: "memory_load" },
  { name: "i32.load8_s",     opcode: 0x2c, category: "memory_load" },
  { name: "i32.load8_u",     opcode: 0x2d, category: "memory_load" },
  { name: "i32.load16_s",    opcode: 0x2e, category: "memory_load" },
  { name: "i32.load16_u",    opcode: 0x2f, category: "memory_load" },
  { name: "i64.load8_s",     opcode: 0x30, category: "memory_load" },
  { name: "i64.load8_u",     opcode: 0x31, category: "memory_load" },
  { name: "i64.load16_s",    opcode: 0x32, category: "memory_load" },
  { name: "i64.load16_u",    opcode: 0x33, category: "memory_load" },
  { name: "i64.load32_s",    opcode: 0x34, category: "memory_load" },
  { name: "i64.load32_u",    opcode: 0x35, category: "memory_load" },

  // ── Memory Store ──
  { name: "i32.store",       opcode: 0x36, category: "memory_store" },
  { name: "i64.store",       opcode: 0x37, category: "memory_store" },
  { name: "f32.store",       opcode: 0x38, category: "memory_store" },
  { name: "f64.store",       opcode: 0x39, category: "memory_store" },
  { name: "i32.store8",      opcode: 0x3a, category: "memory_store" },
  { name: "i32.store16",     opcode: 0x3b, category: "memory_store" },
  { name: "i64.store8",      opcode: 0x3c, category: "memory_store" },
  { name: "i64.store16",     opcode: 0x3d, category: "memory_store" },
  { name: "i64.store32",     opcode: 0x3e, category: "memory_store" },

  // ── Memory Misc ──
  { name: "memory.size",     opcode: 0x3f, category: "memory_misc" },
  { name: "memory.grow",     opcode: 0x40, category: "memory_misc" },

  // ── Constants ──
  { name: "i32.const",       opcode: 0x41, category: "i32_numeric" },
  { name: "i64.const",       opcode: 0x42, category: "i64_numeric" },
  { name: "f32.const",       opcode: 0x43, category: "f32_numeric" },
  { name: "f64.const",       opcode: 0x44, category: "f64_numeric" },

  // ── i32 Comparison ──
  { name: "i32.eqz",         opcode: 0x45, category: "i32_numeric" },
  { name: "i32.eq",          opcode: 0x46, category: "i32_numeric" },
  { name: "i32.ne",          opcode: 0x47, category: "i32_numeric" },
  { name: "i32.lt_s",        opcode: 0x48, category: "i32_numeric" },
  { name: "i32.lt_u",        opcode: 0x49, category: "i32_numeric" },
  { name: "i32.gt_s",        opcode: 0x4a, category: "i32_numeric" },
  { name: "i32.gt_u",        opcode: 0x4b, category: "i32_numeric" },
  { name: "i32.le_s",        opcode: 0x4c, category: "i32_numeric" },
  { name: "i32.le_u",        opcode: 0x4d, category: "i32_numeric" },
  { name: "i32.ge_s",        opcode: 0x4e, category: "i32_numeric" },
  { name: "i32.ge_u",        opcode: 0x4f, category: "i32_numeric" },

  // ── i64 Comparison ──
  { name: "i64.eqz",         opcode: 0x50, category: "i64_numeric" },
  { name: "i64.eq",          opcode: 0x51, category: "i64_numeric" },
  { name: "i64.ne",          opcode: 0x52, category: "i64_numeric" },
  { name: "i64.lt_s",        opcode: 0x53, category: "i64_numeric" },
  { name: "i64.lt_u",        opcode: 0x54, category: "i64_numeric" },
  { name: "i64.gt_s",        opcode: 0x55, category: "i64_numeric" },
  { name: "i64.gt_u",        opcode: 0x56, category: "i64_numeric" },
  { name: "i64.le_s",        opcode: 0x57, category: "i64_numeric" },
  { name: "i64.le_u",        opcode: 0x58, category: "i64_numeric" },
  { name: "i64.ge_s",        opcode: 0x59, category: "i64_numeric" },
  { name: "i64.ge_u",        opcode: 0x5a, category: "i64_numeric" },

  // ── f32 Comparison ──
  { name: "f32.eq",          opcode: 0x5b, category: "f32_numeric" },
  { name: "f32.ne",          opcode: 0x5c, category: "f32_numeric" },
  { name: "f32.lt",          opcode: 0x5d, category: "f32_numeric" },
  { name: "f32.gt",          opcode: 0x5e, category: "f32_numeric" },
  { name: "f32.le",          opcode: 0x5f, category: "f32_numeric" },
  { name: "f32.ge",          opcode: 0x60, category: "f32_numeric" },

  // ── f64 Comparison ──
  { name: "f64.eq",          opcode: 0x61, category: "f64_numeric" },
  { name: "f64.ne",          opcode: 0x62, category: "f64_numeric" },
  { name: "f64.lt",          opcode: 0x63, category: "f64_numeric" },
  { name: "f64.gt",          opcode: 0x64, category: "f64_numeric" },
  { name: "f64.le",          opcode: 0x65, category: "f64_numeric" },
  { name: "f64.ge",          opcode: 0x66, category: "f64_numeric" },

  // ── i32 Arithmetic ──
  { name: "i32.clz",         opcode: 0x67, category: "i32_numeric" },
  { name: "i32.ctz",         opcode: 0x68, category: "i32_numeric" },
  { name: "i32.popcnt",      opcode: 0x69, category: "i32_numeric" },
  { name: "i32.add",         opcode: 0x6a, category: "i32_numeric" },
  { name: "i32.sub",         opcode: 0x6b, category: "i32_numeric" },
  { name: "i32.mul",         opcode: 0x6c, category: "i32_numeric" },
  { name: "i32.div_s",       opcode: 0x6d, category: "i32_numeric" },
  { name: "i32.div_u",       opcode: 0x6e, category: "i32_numeric" },
  { name: "i32.rem_s",       opcode: 0x6f, category: "i32_numeric" },
  { name: "i32.rem_u",       opcode: 0x70, category: "i32_numeric" },
  { name: "i32.and",         opcode: 0x71, category: "i32_numeric" },
  { name: "i32.or",          opcode: 0x72, category: "i32_numeric" },
  { name: "i32.xor",         opcode: 0x73, category: "i32_numeric" },
  { name: "i32.shl",         opcode: 0x74, category: "i32_numeric" },
  { name: "i32.shr_s",       opcode: 0x75, category: "i32_numeric" },
  { name: "i32.shr_u",       opcode: 0x76, category: "i32_numeric" },
  { name: "i32.rotl",        opcode: 0x77, category: "i32_numeric" },
  { name: "i32.rotr",        opcode: 0x78, category: "i32_numeric" },

  // ── i64 Arithmetic ──
  { name: "i64.clz",         opcode: 0x79, category: "i64_numeric" },
  { name: "i64.ctz",         opcode: 0x7a, category: "i64_numeric" },
  { name: "i64.popcnt",      opcode: 0x7b, category: "i64_numeric" },
  { name: "i64.add",         opcode: 0x7c, category: "i64_numeric" },
  { name: "i64.sub",         opcode: 0x7d, category: "i64_numeric" },
  { name: "i64.mul",         opcode: 0x7e, category: "i64_numeric" },
  { name: "i64.div_s",       opcode: 0x7f, category: "i64_numeric" },
  { name: "i64.div_u",       opcode: 0x80, category: "i64_numeric" },
  { name: "i64.rem_s",       opcode: 0x81, category: "i64_numeric" },
  { name: "i64.rem_u",       opcode: 0x82, category: "i64_numeric" },
  { name: "i64.and",         opcode: 0x83, category: "i64_numeric" },
  { name: "i64.or",          opcode: 0x84, category: "i64_numeric" },
  { name: "i64.xor",         opcode: 0x85, category: "i64_numeric" },
  { name: "i64.shl",         opcode: 0x86, category: "i64_numeric" },
  { name: "i64.shr_s",       opcode: 0x87, category: "i64_numeric" },
  { name: "i64.shr_u",       opcode: 0x88, category: "i64_numeric" },
  { name: "i64.rotl",        opcode: 0x89, category: "i64_numeric" },
  { name: "i64.rotr",        opcode: 0x8a, category: "i64_numeric" },

  // ── f32 Arithmetic ──
  { name: "f32.abs",         opcode: 0x8b, category: "f32_numeric" },
  { name: "f32.neg",         opcode: 0x8c, category: "f32_numeric" },
  { name: "f32.ceil",        opcode: 0x8d, category: "f32_numeric" },
  { name: "f32.floor",       opcode: 0x8e, category: "f32_numeric" },
  { name: "f32.trunc",       opcode: 0x8f, category: "f32_numeric" },
  { name: "f32.nearest",     opcode: 0x90, category: "f32_numeric" },
  { name: "f32.sqrt",        opcode: 0x91, category: "f32_numeric" },
  { name: "f32.add",         opcode: 0x92, category: "f32_numeric" },
  { name: "f32.sub",         opcode: 0x93, category: "f32_numeric" },
  { name: "f32.mul",         opcode: 0x94, category: "f32_numeric" },
  { name: "f32.div",         opcode: 0x95, category: "f32_numeric" },
  { name: "f32.min",         opcode: 0x96, category: "f32_numeric" },
  { name: "f32.max",         opcode: 0x97, category: "f32_numeric" },
  { name: "f32.copysign",    opcode: 0x98, category: "f32_numeric" },

  // ── f64 Arithmetic ──
  { name: "f64.abs",         opcode: 0x99, category: "f64_numeric" },
  { name: "f64.neg",         opcode: 0x9a, category: "f64_numeric" },
  { name: "f64.ceil",        opcode: 0x9b, category: "f64_numeric" },
  { name: "f64.floor",       opcode: 0x9c, category: "f64_numeric" },
  { name: "f64.trunc",       opcode: 0x9d, category: "f64_numeric" },
  { name: "f64.nearest",     opcode: 0x9e, category: "f64_numeric" },
  { name: "f64.sqrt",        opcode: 0x9f, category: "f64_numeric" },
  { name: "f64.add",         opcode: 0xa0, category: "f64_numeric" },
  { name: "f64.sub",         opcode: 0xa1, category: "f64_numeric" },
  { name: "f64.mul",         opcode: 0xa2, category: "f64_numeric" },
  { name: "f64.div",         opcode: 0xa3, category: "f64_numeric" },
  { name: "f64.min",         opcode: 0xa4, category: "f64_numeric" },
  { name: "f64.max",         opcode: 0xa5, category: "f64_numeric" },
  { name: "f64.copysign",    opcode: 0xa6, category: "f64_numeric" },

  // ── Type Conversion ──
  { name: "i32.wrap_i64",          opcode: 0xa7, category: "type_conversion" },
  { name: "i32.trunc_f32_s",      opcode: 0xa8, category: "type_conversion" },
  { name: "i32.trunc_f32_u",      opcode: 0xa9, category: "type_conversion" },
  { name: "i32.trunc_f64_s",      opcode: 0xaa, category: "type_conversion" },
  { name: "i32.trunc_f64_u",      opcode: 0xab, category: "type_conversion" },
  { name: "i64.extend_i32_s",     opcode: 0xac, category: "type_conversion" },
  { name: "i64.extend_i32_u",     opcode: 0xad, category: "type_conversion" },
  { name: "i64.trunc_f32_s",      opcode: 0xae, category: "type_conversion" },
  { name: "i64.trunc_f32_u",      opcode: 0xaf, category: "type_conversion" },
  { name: "i64.trunc_f64_s",      opcode: 0xb0, category: "type_conversion" },
  { name: "i64.trunc_f64_u",      opcode: 0xb1, category: "type_conversion" },
  { name: "f32.convert_i32_s",    opcode: 0xb2, category: "type_conversion" },
  { name: "f32.convert_i32_u",    opcode: 0xb3, category: "type_conversion" },
  { name: "f32.convert_i64_s",    opcode: 0xb4, category: "type_conversion" },
  { name: "f32.convert_i64_u",    opcode: 0xb5, category: "type_conversion" },
  { name: "f32.demote_f64",       opcode: 0xb6, category: "type_conversion" },
  { name: "f64.convert_i32_s",    opcode: 0xb7, category: "type_conversion" },
  { name: "f64.convert_i32_u",    opcode: 0xb8, category: "type_conversion" },
  { name: "f64.convert_i64_s",    opcode: 0xb9, category: "type_conversion" },
  { name: "f64.convert_i64_u",    opcode: 0xba, category: "type_conversion" },
  { name: "f64.promote_f32",      opcode: 0xbb, category: "type_conversion" },
  { name: "i32.reinterpret_f32",  opcode: 0xbc, category: "type_conversion" },
  { name: "i64.reinterpret_f64",  opcode: 0xbd, category: "type_conversion" },
  { name: "f32.reinterpret_i32",  opcode: 0xbe, category: "type_conversion" },
  { name: "f64.reinterpret_i64",  opcode: 0xbf, category: "type_conversion" },
];
