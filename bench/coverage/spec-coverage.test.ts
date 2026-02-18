import { describe, test } from "vitest";
import { OP } from "../../src/wasm/opcodes";
import { WASM_MVP_CATALOG, type Category } from "./wasm-mvp-catalog";

// ── Layer 1: opcodes in OP object ──
const opValues = new Set<number>(Object.values(OP));

// ── Layer 2: opcodes actually emitted by codegen.ts ──
// Derived from static analysis of emitIR() switch cases + binops/cmps tables
const codegenOpcodes = new Set<number>([
  // Direct switch cases
  OP.i32_const,   // const_i32
  OP.i64_const,   // const_i64
  OP.local_get,   // local_get
  OP.local_set,   // local_set
  OP.local_tee,   // local_tee
  OP.if_,         // if
  OP.else_,       // if (else branch)
  OP.end,         // if/block/loop terminator
  OP.block,       // block
  OP.loop,        // loop
  OP.br_if,       // br_if
  OP.br,          // br
  OP.call,        // call
  OP.drop,        // drop
  OP.return_,     // return
  OP.i32_store,   // store_i32
  OP.i32_load,    // load_i32
  OP.i32_store8,  // store_i32_8
  OP.i32_load8_u, // load_i32_8u
  OP.nop,         // nop
  OP.i32_eqz,     // eqz
  // binops table
  OP.i32_add, OP.i32_sub, OP.i32_mul, OP.i32_div_s, OP.i32_rem_s,
  OP.i32_and, OP.i32_or, OP.i32_xor, OP.i32_shl, OP.i32_shr_s,
  // cmps table
  OP.i32_eq, OP.i32_ne, OP.i32_lt_s, OP.i32_gt_s, OP.i32_le_s, OP.i32_ge_s,
]);

// ── Layer 3: opcodes reachable from DSL API ──
// Derived from namespace analysis (Mod/Op/Mem/Ctrl/Loc)
const dslOpcodes = new Set<number>([
  // Op namespace: all 15 binop/cmp operations
  OP.i32_add, OP.i32_sub, OP.i32_mul, OP.i32_div_s, OP.i32_rem_s,
  OP.i32_eq, OP.i32_ne, OP.i32_lt_s, OP.i32_gt_s, OP.i32_le_s, OP.i32_ge_s,
  OP.i32_and, OP.i32_or, OP.i32_xor, OP.i32_shl, OP.i32_shr_s,
  // Mem namespace
  OP.i32_load,    // Mem.load()
  OP.i32_store,   // Mem.store()
  OP.i32_load8_u, // Mem.load8()
  OP.i32_store8,  // Mem.store8()
  OP.i32_const,   // Mem.i32()
  OP.i64_const,   // Mem.i64()
  // Ctrl namespace
  OP.if_,         // Ctrl.if()
  OP.else_,       // (implicit in .then/.else chain)
  OP.end,         // (implicit block terminator)
  OP.loop,        // Ctrl.loop()
  OP.block,       // Ctrl.block()
  OP.br,          // Ctrl.br()
  OP.br_if,       // Ctrl.br_if()
  OP.nop,         // Ctrl.nop()
  // Loc namespace
  OP.local_get,   // Loc.get()
  OP.local_set,   // Loc.set()
  OP.local_tee,   // Loc.tee()
  OP.drop,        // Loc.drop()
  OP.return_,     // Loc.return()
  // Mod namespace (call emitted by func invocation)
  OP.call,        // callable func invocation
  // eqz (used internally by Ctrl.while/for)
  OP.i32_eqz,     // Ctrl.while/for condition negation
]);

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
