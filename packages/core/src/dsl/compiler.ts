/**
 * Public entry point barrel for the generator-based DSL.
 *
 * Re-exports all user-facing DSL primitives from their source modules:
 * `compile`, `param`, `local`, namespaces (Mod/Op/Mem/Ctrl/Loc),
 * type definitions, and intercept utilities.
 *
 * @example
 * ```ts
 * import { compile, param, Type, Mod, Ctrl, Loc } from "./compiler";
 *
 * const binary = compile(function* () {
 *   const f = yield* Mod.func(function* () {
 *     const a = yield* param(Type.i32);
 *     const b = yield* param(Type.i32);
 *     return yield* a.add(b);
 *   });
 *   yield* Mod.export("add", f);
 * });
 * ```
 */
export { compile, compileWithDiagnostics, type CompileOptions, type DiagnosticResult } from "./interpreter";
export { DiagnosticCollector, type Diagnostic, type DiagnosticLevel, type DiagnosticOptions } from "./diagnostics";
export {
  // Declarations
  param,
  local,
  locals,
  Type,
  // Fluent API
  ChainableExpr,
  ThenBuilder,
  ElseIfBuilder,
  type ExprInput,
  type CallableFunc,
  // Statement combinator
  run,
  // Namespaces
  Mod,
  Op,
  Mem,
  Ctrl,
  Loc,
  // Top-level constant helpers
  i32,
  i64,
  f64,
  // Compile-time macro helpers
  Meta,
  // Struct presets
  RGBA,
  // Data structure helpers
  Queue,
  Stack,
  RingBuffer,
  BitSet,
  MinHeap,
  HashMap,
} from "./primitives";
export {
  WasmRef,
  type WasmBinary,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type VoidBody,
  type VoidStmt,
  type ModuleGen,
  type WasmProgram,
} from "./types";
export {
  intercept,
  interceptIR,
  withTrace,
  interceptModule,
  composeIntercepts,
  interceptFilter,
  interceptWhen,
  type TraceEntry,
} from "./intercept";
