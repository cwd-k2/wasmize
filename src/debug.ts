import { compileToIR } from "./dsl/interpreter";
import { compile } from "./dsl/compiler";
import { moduleToWAT } from "./wasm/wat";
import { withTrace, type TraceEntry } from "./dsl/intercept";
import type { WasmProgram, WasmBinary, FuncBody, FuncReturn } from "./dsl/types";
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
 * Compiles a program and returns binary with WAT attached.
 */
export function compileWithWat<T>(
  program: WasmProgram,
  options?: { optimize?: boolean },
): WasmBinary<T> & { wat: string } {
  const binary = compile<T>(program, options);
  const { funcs, moduleOptions } = compileToIR(program, options);
  const wat = moduleToWAT(funcs, moduleOptions);
  return Object.assign(binary, { wat }) as WasmBinary<T> & { wat: string };
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

/**
 * Wraps a function body with trace collection.
 * Use inside `Mod.exportFunc()` or `Mod.func()` body parameter.
 *
 * @example
 * ```ts
 * const trace: TraceEntry[] = [];
 * compile(function* () {
 *   yield* Mod.exportFunc("fib", { n: Type.i32 }, traceBody("fib", trace, function* () {
 *     // ...body...
 *   }));
 * });
 * ```
 */
export function traceBody<T extends FuncReturn>(
  label: string,
  collector: TraceEntry[],
  body: FuncBody<T>,
): FuncBody<T> {
  return () => withTrace(label, body(), collector);
}
