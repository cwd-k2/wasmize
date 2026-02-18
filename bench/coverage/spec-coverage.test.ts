import { describe, test } from "vitest";
import { OP } from "../../src/wasm/opcodes";
import { WASM_MVP_CATALOG, type Category } from "./wasm-mvp-catalog";

// ── Layer 1: opcodes in OP object ──
const opValues = new Set<number>(Object.values(OP));

// ── Layer 2: opcodes actually emitted by codegen.ts ──
// Derived from static analysis of emitIR() switch cases + dispatch tables
const codegenOpcodes = new Set<number>([
  // --- Control ---
  OP.unreachable, OP.nop, OP.block, OP.loop, OP.if_, OP.else_, OP.end,
  OP.br, OP.br_if, OP.br_table, OP.return_, OP.call,

  // --- Parametric ---
  OP.drop, OP.select,

  // --- Variable ---
  OP.local_get, OP.local_set, OP.local_tee,
  OP.global_get, OP.global_set,

  // --- Constants ---
  OP.i32_const, OP.i64_const, OP.f32_const, OP.f64_const,

  // --- Memory load (dedicated + mem_load table) ---
  OP.i32_load, OP.i64_load, OP.f32_load, OP.f64_load,
  OP.i32_load8_s, OP.i32_load8_u, OP.i32_load16_s, OP.i32_load16_u,
  OP.i64_load8_s, OP.i64_load8_u, OP.i64_load16_s, OP.i64_load16_u,
  OP.i64_load32_s, OP.i64_load32_u,

  // --- Memory store (dedicated + mem_store table) ---
  OP.i32_store, OP.i64_store, OP.f32_store, OP.f64_store,
  OP.i32_store8, OP.i32_store16,
  OP.i64_store8, OP.i64_store16, OP.i64_store32,

  // --- Memory misc ---
  OP.memory_size, OP.memory_grow,

  // --- i32 numeric (binopTable + cmpTable + unaryTable + eqz) ---
  OP.i32_eqz,
  OP.i32_eq, OP.i32_ne, OP.i32_lt_s, OP.i32_lt_u, OP.i32_gt_s, OP.i32_gt_u,
  OP.i32_le_s, OP.i32_le_u, OP.i32_ge_s, OP.i32_ge_u,
  OP.i32_clz, OP.i32_ctz, OP.i32_popcnt,
  OP.i32_add, OP.i32_sub, OP.i32_mul, OP.i32_div_s, OP.i32_div_u,
  OP.i32_rem_s, OP.i32_rem_u,
  OP.i32_and, OP.i32_or, OP.i32_xor, OP.i32_shl, OP.i32_shr_s, OP.i32_shr_u,
  OP.i32_rotl, OP.i32_rotr,

  // --- i64 numeric (binopTable + cmpTable + unaryTable + eqz) ---
  OP.i64_eqz,
  OP.i64_eq, OP.i64_ne, OP.i64_lt_s, OP.i64_lt_u, OP.i64_gt_s, OP.i64_gt_u,
  OP.i64_le_s, OP.i64_le_u, OP.i64_ge_s, OP.i64_ge_u,
  OP.i64_clz, OP.i64_ctz, OP.i64_popcnt,
  OP.i64_add, OP.i64_sub, OP.i64_mul, OP.i64_div_s, OP.i64_div_u,
  OP.i64_rem_s, OP.i64_rem_u,
  OP.i64_and, OP.i64_or, OP.i64_xor, OP.i64_shl, OP.i64_shr_s, OP.i64_shr_u,
  OP.i64_rotl, OP.i64_rotr,

  // --- f32 numeric (binopTable + cmpTable + unaryTable) ---
  OP.f32_eq, OP.f32_ne, OP.f32_lt, OP.f32_gt, OP.f32_le, OP.f32_ge,
  OP.f32_abs, OP.f32_neg, OP.f32_ceil, OP.f32_floor, OP.f32_trunc,
  OP.f32_nearest, OP.f32_sqrt,
  OP.f32_add, OP.f32_sub, OP.f32_mul, OP.f32_div,
  OP.f32_min, OP.f32_max, OP.f32_copysign,

  // --- f64 numeric (binopTable + cmpTable + unaryTable + dedicated) ---
  OP.f64_eq, OP.f64_ne, OP.f64_lt, OP.f64_gt, OP.f64_le, OP.f64_ge,
  OP.f64_abs, OP.f64_neg, OP.f64_ceil, OP.f64_floor, OP.f64_trunc,
  OP.f64_nearest, OP.f64_sqrt,
  OP.f64_add, OP.f64_sub, OP.f64_mul, OP.f64_div,
  OP.f64_min, OP.f64_max, OP.f64_copysign,

  // --- Type conversions (dedicated + convertTable) ---
  OP.i32_wrap_i64,
  OP.i32_trunc_f32_s, OP.i32_trunc_f32_u, OP.i32_trunc_f64_s, OP.i32_trunc_f64_u,
  OP.i64_extend_i32_s, OP.i64_extend_i32_u,
  OP.i64_trunc_f32_s, OP.i64_trunc_f32_u, OP.i64_trunc_f64_s, OP.i64_trunc_f64_u,
  OP.f32_convert_i32_s, OP.f32_convert_i32_u, OP.f32_convert_i64_s, OP.f32_convert_i64_u,
  OP.f32_demote_f64,
  OP.f64_convert_i32_s, OP.f64_convert_i32_u, OP.f64_convert_i64_s, OP.f64_convert_i64_u,
  OP.f64_promote_f32,
  OP.i32_reinterpret_f32, OP.i64_reinterpret_f64,
  OP.f32_reinterpret_i32, OP.f64_reinterpret_i64,
]);

// ── Layer 3: opcodes reachable from DSL API ──
// Same as codegen (all wired opcodes are exposed via DSL namespaces)
const dslOpcodes = new Set<number>(codegenOpcodes);

function pct(n: number, total: number): string {
  return total === 0 ? "  0%" : `${Math.round((n / total) * 100).toString().padStart(3)}%`;
}

function fmtCell(n: number, total: number): string {
  return `${n.toString().padStart(3)} (${pct(n, total)})`;
}

describe("Wasm MVP Spec Coverage", () => {
  test("coverage report", () => {
    const categories = [
      ...new Set(WASM_MVP_CATALOG.map((i) => i.category)),
    ] as Category[];

    const rows: string[] = [];
    let totalAll = 0, totalOp = 0, totalCg = 0, totalDsl = 0;

    for (const cat of categories) {
      const instrs = WASM_MVP_CATALOG.filter((i) => i.category === cat);
      const total = instrs.length;
      const inOp = instrs.filter((i) => opValues.has(i.opcode)).length;
      const inCg = instrs.filter((i) => codegenOpcodes.has(i.opcode)).length;
      const inDsl = instrs.filter((i) => dslOpcodes.has(i.opcode)).length;

      totalAll += total;
      totalOp += inOp;
      totalCg += inCg;
      totalDsl += inDsl;

      rows.push(
        `| ${cat.padEnd(17)} | ${total.toString().padStart(5)} | ${fmtCell(inOp, total)} | ${fmtCell(inCg, total)} | ${fmtCell(inDsl, total)} |`,
      );
    }

    const header = [
      "",
      "## Wasm MVP Spec Coverage Report",
      "",
      "| Category          | Total | opcodes.ts  | codegen     | DSL         |",
      "|-------------------|-------|-------------|-------------|-------------|",
      ...rows,
      "|-------------------|-------|-------------|-------------|-------------|",
      `| ${"TOTAL".padEnd(17)} | ${totalAll.toString().padStart(5)} | ${fmtCell(totalOp, totalAll)} | ${fmtCell(totalCg, totalAll)} | ${fmtCell(totalDsl, totalAll)} |`,
    ];

    console.log(header.join("\n"));

    // Gap analysis
    const gaps = {
      opOnly: [] as string[],
      noOp: [] as string[],
    };

    for (const instr of WASM_MVP_CATALOG) {
      const inOp = opValues.has(instr.opcode);
      const inCg = codegenOpcodes.has(instr.opcode);
      if (inOp && !inCg) gaps.opOnly.push(instr.name);
      if (!inOp) gaps.noOp.push(instr.name);
    }

    console.log("\n## Gap Analysis\n");
    console.log(`### In opcodes.ts but not emitted by codegen (${gaps.opOnly.length}):`);
    console.log(gaps.opOnly.map((n) => `  - ${n}`).join("\n") || "  (none)");
    console.log(`\n### Not in opcodes.ts at all (${gaps.noOp.length}):`);
    for (const cat of categories) {
      const missing = WASM_MVP_CATALOG.filter(
        (i) => i.category === cat && !opValues.has(i.opcode),
      );
      if (missing.length > 0) {
        console.log(`  ${cat}: ${missing.map((i) => i.name).join(", ")}`);
      }
    }
  });
});
