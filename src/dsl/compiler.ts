/**
 * @module compiler
 *
 * Public entry point for the generator-based DSL.
 *
 * Structural primitives are exported individually:
 * `compile`, `func`, `export_`, `import_`, `memory`, `param`, `local`.
 *
 * All other primitives are organized into namespaces:
 * - {@link op} — arithmetic, comparison, bitwise
 * - {@link mem} — memory access and constants
 * - {@link ctrl} — control flow, branching, calls
 * - {@link loc} — local variable operations
 *
 * @example
 * ```ts
 * import { compile, func, export_, param, local, op, mem, ctrl, loc } from "./compiler";
 *
 * const binary = compile(function* () {
 *   const f = yield* func(function* () {
 *     const a = yield* param("i32");
 *     const b = yield* param("i32");
 *     return yield* a.add(b);
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
  // Fluent API
  ChainableExpr,
  ThenBuilder,
  type ExprInput,
  // Namespaces
  op,
  mem,
  ctrl,
  loc,
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
