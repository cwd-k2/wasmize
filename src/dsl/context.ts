import type { IRNode } from "../wasm/ir";
import type { FuncDef, ImportDef, ExportDef } from "../wasm/module";

export class DSLContext {
  ir: IRNode[] = [];
  funcs: FuncDef[] = [];
  imports: ImportDef[] = [];
  exports: ExportDef[] = [];
  effects: unknown[] = [];
  localCount = 0;
  paramCount = 0;
}
