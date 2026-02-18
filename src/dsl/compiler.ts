/**
 * @module compiler
 *
 * Public entry point for the generator-based DSL.
 *
 * Structural primitives: `compile`, `param`, `local`.
 *
 * Namespaces:
 * - {@link mod} — module declarations (func, export, import, memory)
 * - {@link op} — arithmetic, comparison, bitwise
 * - {@link mem} — memory access and constants
 * - {@link ctrl} — control flow, branching
 * - {@link loc} — local variable operations
 *
 * @example
 * ```ts
 * import { compile, param, local, mod, ctrl, loc } from "./compiler";
 *
 * const binary = compile(function* () {
 *   const f = yield* mod.func(function* () {
 *     const a = yield* param("i32");
 *     const b = yield* param("i32");
 *     return yield* a.add(b);
 *   });
 *   yield* mod.export("add", f);
 * });
 * ```
 */
export { compile } from "./interpreter";
export {
  // Declarations
  param,
  local,
  // Fluent API
  ChainableExpr,
  ThenBuilder,
  type ExprInput,
  type CallableFunc,
  // Namespaces
  mod,
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
