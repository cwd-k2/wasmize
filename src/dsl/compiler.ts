import type { IRNode } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import type { ImportDef } from "../wasm/module";
import { buildModule } from "../wasm/module";
import { DSLContext } from "./context";

export interface ProblemDesc {
  imports?: ImportDef[];
  funcs: {
    params?: WasmValType[];
    results?: WasmValType[];
    locals?: WasmValType[];
    body: IRNode[];
  }[];
  exports: { name: string; funcIdx: number }[];
  memoryPages?: number;
}

export function compileProblem(desc: ProblemDesc): Uint8Array {
  const ctx = new DSLContext();

  if (desc.imports) {
    desc.imports.forEach((im) => {
      ctx.imports.push(im);
    });
  }

  desc.funcs.forEach((f) => {
    ctx.funcs.push({
      params: f.params || [],
      results: f.results || ["i32"],
      locals: f.locals || [],
      body: f.body,
    });
  });

  const funcOffset = ctx.imports.length;
  desc.exports.forEach((e) => {
    ctx.exports.push({ name: e.name, idx: funcOffset + e.funcIdx });
  });

  return buildModule(ctx.funcs, {
    imports: ctx.imports,
    memoryPages: desc.memoryPages || 1,
    exports: ctx.exports,
  });
}
