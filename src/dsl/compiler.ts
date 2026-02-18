/**
 * @module compiler
 *
 * Public entry point for the generator-based DSL.
 * Re-exports all primitives, types, and the {@link compile} function
 * from their respective modules.
 *
 * @example
 * ```ts
 * import { compile, func, export_, param, add, get } from "./compiler";
 *
 * const binary = compile(function* () {
 *   const f = yield* func(function* () {
 *     const a = yield* param("i32");
 *     const b = yield* param("i32");
 *     return yield* add(get(a), get(b));
 *   });
 *   yield* export_("add", f);
 * });
 * ```
 */
export { compile } from "./interpreter";
export {
  // Module-level
  import_,
  func,
  export_,
  memory,
  // Declarations
  param,
  local,
  // Expressions
  i32,
  i64,
  get,
  add,
  sub,
  mul,
  div,
  rem,
  and_,
  or_,
  xor_,
  shl,
  shr,
  eq,
  ne,
  lt,
  gt,
  le,
  ge,
  load,
  call,
  // Statements
  set,
  tee,
  store,
  call_,
  drop_,
  return_,
  br,
  br_if,
  nop_,
  effect,
  // Control flow
  if_,
  loop_,
  block_,
  // Fluent API
  ChainableExpr,
  ThenBuilder,
  type ExprInput,
} from "./primitives";
export {
  WasmRef,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type ModuleGen,
  type WasmProgram,
} from "./types";
