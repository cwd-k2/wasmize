import { compileToIR } from "./dsl/interpreter";
import { compile } from "./dsl/compiler";
import { moduleToWAT } from "./wasm/wat";
import type { WasmProgram, WasmBinary } from "./dsl/types";
import type { WasmValType } from "./wasm/opcodes";
import type { IRNode } from "./wasm/ir";
import type { ImportDef, ExportDef } from "./wasm/module";

interface IRFuncInfo {
  name?: string;
  params: WasmValType[];
  results: WasmValType[];
  locals: WasmValType[];
  body: IRNode[];
}

interface IRResult {
  funcs: IRFuncInfo[];
  imports: ImportDef[];
  exports: ExportDef[];
  memoryPages: number;
}

interface MetadataResult {
  binary: WasmBinary<any>;
  ir: IRResult;
  wat: string;
}

/**
 * Compiles a program and returns structured IR metadata.
 */
export function inspectIR(
  program: WasmProgram,
  options?: { optimize?: boolean },
): IRResult {
  const { funcs, moduleOptions } = compileToIR(program, options);
  const exportMap = new Map<number, string>();
  for (const exp of moduleOptions.exports ?? []) {
    exportMap.set(exp.idx, exp.name);
  }
  const importCount = moduleOptions.imports?.length ?? 0;

  return {
    funcs: funcs.map((f, i) => ({
      name: exportMap.get(i + importCount),
      params: f.params,
      results: f.results,
      locals: f.locals ?? [],
      body: f.body,
    })),
    imports: moduleOptions.imports ?? [],
    exports: moduleOptions.exports ?? [],
    memoryPages: moduleOptions.memoryPages ?? 1,
  };
}

/**
 * Compiles a program and returns binary, IR, and WAT together.
 */
export function compileWithMetadata(
  program: WasmProgram,
  options?: { optimize?: boolean },
): MetadataResult {
  const ir = inspectIR(program, options);
  const { funcs, moduleOptions } = compileToIR(program, options);
  const binary = compile(program, options);
  const wat = moduleToWAT(funcs, moduleOptions);

  return { binary, ir, wat };
}
