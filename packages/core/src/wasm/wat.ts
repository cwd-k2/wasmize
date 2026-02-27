/**
 * WAT (WebAssembly Text Format) generation from IR.
 *
 * Converts {@link IRNode} trees and {@link FuncDef} arrays into human-readable
 * WAT text for debugging and inspection. Used by `compileWithWat()` in `debug.ts`.
 *
 * @module
 */
import type { IRNode } from "./ir";
import type { FuncDef, ModuleOptions } from "./module";
import type { WasmValType } from "./opcodes";

function typeStr(t: WasmValType): string {
  return t;
}

function indent(s: string, depth: number): string {
  return "  ".repeat(depth) + s;
}

/** Converts a single IR node to WAT string lines. */
export function irToWAT(node: IRNode, depth: number = 0): string {
  switch (node.op) {
    case "const_i32":
      return indent(`i32.const ${node.v}`, depth);
    case "const_i64":
      return indent(`i64.const ${node.v}`, depth);
    case "const_f32":
      return indent(`f32.const ${node.v}`, depth);
    case "const_f64":
      return indent(`f64.const ${node.v}`, depth);
    case "local_get":
      return indent(`local.get ${node.i}`, depth);
    case "local_set":
      return [irToWAT(node.val, depth), indent(`local.set ${node.i}`, depth)].join("\n");
    case "local_tee":
      return [irToWAT(node.val, depth), indent(`local.tee ${node.i}`, depth)].join("\n");
    case "global_get":
      return indent(`global.get ${node.idx}`, depth);
    case "global_set":
      return [irToWAT(node.val, depth), indent(`global.set ${node.idx}`, depth)].join("\n");
    case "binop": {
      const t = node.type || "i32";
      return [
        irToWAT(node.a, depth),
        irToWAT(node.b, depth),
        indent(`${t}.${node.kind}`, depth),
      ].join("\n");
    }
    case "cmp": {
      const t = node.type || "i32";
      return [
        irToWAT(node.a, depth),
        irToWAT(node.b, depth),
        indent(`${t}.${node.kind}`, depth),
      ].join("\n");
    }
    case "unary": {
      const t = node.type || "i32";
      return [irToWAT(node.val, depth), indent(`${t}.${node.kind}`, depth)].join("\n");
    }
    case "convert":
      return [irToWAT(node.val, depth), indent(node.kind.replace(/_/g, "."), depth)].join("\n");
    case "eqz": {
      const t = node.type || "i32";
      return [irToWAT(node.val, depth), indent(`${t}.eqz`, depth)].join("\n");
    }
    case "select":
      return [
        irToWAT(node.a, depth),
        irToWAT(node.b, depth),
        irToWAT(node.cond, depth),
        indent("select", depth),
      ].join("\n");
    case "drop":
      return [irToWAT(node.val, depth), indent("drop", depth)].join("\n");
    case "return":
      return [irToWAT(node.val, depth), indent("return", depth)].join("\n");
    case "call":
      return [...node.args.map((a) => irToWAT(a, depth)), indent(`call ${node.idx}`, depth)].join(
        "\n",
      );
    case "call_indirect":
      return [
        ...node.args.map((a) => irToWAT(a, depth)),
        irToWAT(node.indexExpr, depth),
        indent(`call_indirect (type ${node.typeIdx})`, depth),
      ].join("\n");
    case "load_i32":
      return [irToWAT(node.addr, depth), indent("i32.load", depth)].join("\n");
    case "store_i32":
      return [irToWAT(node.addr, depth), irToWAT(node.val, depth), indent("i32.store", depth)].join(
        "\n",
      );
    case "load_i32_8u":
      return [irToWAT(node.addr, depth), indent("i32.load8_u", depth)].join("\n");
    case "store_i32_8":
      return [
        irToWAT(node.addr, depth),
        irToWAT(node.val, depth),
        indent("i32.store8", depth),
      ].join("\n");
    case "load_i64":
      return [irToWAT(node.addr, depth), indent("i64.load", depth)].join("\n");
    case "store_i64":
      return [irToWAT(node.addr, depth), irToWAT(node.val, depth), indent("i64.store", depth)].join(
        "\n",
      );
    case "load_f64":
      return [irToWAT(node.addr, depth), indent("f64.load", depth)].join("\n");
    case "store_f64":
      return [irToWAT(node.addr, depth), irToWAT(node.val, depth), indent("f64.store", depth)].join(
        "\n",
      );
    case "mem_load": {
      const watName = node.kind.replace(/_/g, ".");
      return [irToWAT(node.addr, depth), indent(watName, depth)].join("\n");
    }
    case "mem_store": {
      const watName = node.kind.replace(/_/g, ".");
      return [irToWAT(node.addr, depth), irToWAT(node.val, depth), indent(watName, depth)].join(
        "\n",
      );
    }
    case "if": {
      const typeAnnotation = node.type === "void" ? "" : ` (result ${node.type})`;
      const lines: string[] = [];
      lines.push(irToWAT(node.cond, depth));
      lines.push(indent(`if${typeAnnotation}`, depth));
      for (const n of node.then) lines.push(irToWAT(n, depth + 1));
      if (node.else.length > 0) {
        lines.push(indent("else", depth));
        for (const n of node.else) lines.push(irToWAT(n, depth + 1));
      }
      lines.push(indent("end", depth));
      return lines.join("\n");
    }
    case "loop": {
      const lines: string[] = [];
      lines.push(indent("loop", depth));
      for (const n of node.body) lines.push(irToWAT(n, depth + 1));
      lines.push(indent("end", depth));
      return lines.join("\n");
    }
    case "block": {
      const lines: string[] = [];
      lines.push(indent("block", depth));
      for (const n of node.body) lines.push(irToWAT(n, depth + 1));
      lines.push(indent("end", depth));
      return lines.join("\n");
    }
    case "br":
      return indent(`br ${node.depth}`, depth);
    case "br_if":
      return [irToWAT(node.cond, depth), indent(`br_if ${node.depth}`, depth)].join("\n");
    case "br_table": {
      const labels = [...node.labels, node.default_].join(" ");
      return [irToWAT(node.val, depth), indent(`br_table ${labels}`, depth)].join("\n");
    }
    case "seq":
      return node.stmts.map((s) => irToWAT(s, depth)).join("\n");
    case "f64_neg":
      return [irToWAT(node.val, depth), indent("f64.neg", depth)].join("\n");
    case "f64_abs":
      return [irToWAT(node.val, depth), indent("f64.abs", depth)].join("\n");
    case "i32_wrap_i64":
      return [irToWAT(node.val, depth), indent("i32.wrap_i64", depth)].join("\n");
    case "i64_extend_i32_s":
      return [irToWAT(node.val, depth), indent("i64.extend_i32_s", depth)].join("\n");
    case "f64_convert_i32_s":
      return [irToWAT(node.val, depth), indent("f64.convert_i32_s", depth)].join("\n");
    case "i32_trunc_f64_s":
      return [irToWAT(node.val, depth), indent("i32.trunc_f64_s", depth)].join("\n");
    case "memory_size":
      return indent("memory.size", depth);
    case "memory_grow":
      return [irToWAT(node.pages, depth), indent("memory.grow", depth)].join("\n");
    case "unreachable":
      return indent("unreachable", depth);
    case "nop":
      return indent("nop", depth);
    case "effect": {
      // effect is sugar: store tag+payload to mem[0..8], return -1
      const lines: string[] = [];
      lines.push(indent(`i32.const 0`, depth));
      lines.push(indent(`i32.const ${node.tag}`, depth));
      lines.push(indent(`i32.store`, depth));
      lines.push(indent(`i32.const 4`, depth));
      lines.push(irToWAT(node.payload, depth));
      lines.push(indent(`i32.store`, depth));
      lines.push(indent(`i32.const -1`, depth));
      lines.push(indent(`return`, depth));
      return lines.join("\n");
    }
    case "memory_copy":
      return [irToWAT(node.dst, depth), irToWAT(node.src, depth), irToWAT(node.len, depth), indent("memory.copy", depth)].join("\n");
    case "memory_fill":
      return [irToWAT(node.dst, depth), irToWAT(node.val, depth), irToWAT(node.len, depth), indent("memory.fill", depth)].join("\n");
  }
}

/** Converts a function definition to WAT. */
export function funcToWAT(func: FuncDef, index: number, exportName?: string): string {
  const lines: string[] = [];
  const exportStr = exportName ? ` (export "${exportName}")` : "";
  const paramStr = func.params.map((p, i) => ` (param $p${i} ${typeStr(p)})`).join("");
  const resultStr =
    func.results.length > 0 ? ` (result ${func.results.map(typeStr).join(" ")})` : "";

  lines.push(`  (func $f${index}${exportStr}${paramStr}${resultStr}`);

  // Locals
  if (func.locals && func.locals.length > 0) {
    for (let i = 0; i < func.locals.length; i++) {
      lines.push(`    (local $l${i} ${typeStr(func.locals[i]!)})`);
    }
  }

  // Body
  for (const node of func.body) {
    lines.push(irToWAT(node, 2));
  }

  lines.push("  )");
  return lines.join("\n");
}

/** Converts a complete module to WAT. */
export function moduleToWAT(funcs: FuncDef[], options?: ModuleOptions): string {
  const lines: string[] = [];
  lines.push("(module");

  // Memory
  const pages = options?.memoryPages ?? 1;
  const hasMemExport = true; // always export memory like buildModule does
  lines.push(`  (memory${hasMemExport ? ` (export "memory")` : ""} ${pages})`);

  // Imports
  if (options?.imports) {
    for (const imp of options.imports) {
      const paramStr = imp.params.map(typeStr).join(" ");
      const resultStr = imp.results.map(typeStr).join(" ");
      const typeStr2 = `(func (param ${paramStr})${resultStr ? ` (result ${resultStr})` : ""})`;
      lines.push(`  (import "${imp.module}" "${imp.name}" ${typeStr2})`);
    }
  }

  // Globals
  if (options?.globals) {
    for (const g of options.globals) {
      const mutStr = g.mutable ? `(mut ${typeStr(g.type)})` : typeStr(g.type);
      lines.push(`  (global ${mutStr} (${typeStr(g.type)}.const ${g.init}))`);
    }
  }

  // Functions
  const exportMap = new Map<number, string>();
  if (options?.exports) {
    for (const exp of options.exports) {
      exportMap.set(exp.idx, exp.name);
    }
  }

  const importCount = options?.imports?.length ?? 0;
  for (let i = 0; i < funcs.length; i++) {
    lines.push(funcToWAT(funcs[i]!, i + importCount, exportMap.get(i + importCount)));
  }

  // Data segments
  if (options?.dataSegments) {
    for (const seg of options.dataSegments) {
      const hexBytes = Array.from(seg.init)
        .map((b) => `\\${b.toString(16).padStart(2, "0")}`)
        .join("");
      lines.push(`  (data (i32.const ${seg.offset}) "${hexBytes}")`);
    }
  }

  lines.push(")");
  return lines.join("\n");
}
