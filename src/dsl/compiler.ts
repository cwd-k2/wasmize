/**
 * @module compiler
 *
 * Public entry point for the generator-based DSL.
 *
 * Structural primitives: `compile`, `param`, `local`.
 *
 * Namespaces:
 * - {@link Mod} — module declarations (func, export, import, memory)
 * - {@link Op} — arithmetic, comparison, bitwise
 * - {@link Mem} — memory access and constants
 * - {@link Ctrl} — control flow, branching
 * - {@link Loc} — local variable operations
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
export { compile } from "./interpreter";
export {
  // Declarations
  param,
  local,
  Type,
  // Fluent API
  ChainableExpr,
  ThenBuilder,
  type ExprInput,
  type CallableFunc,
  // Namespaces
  Mod,
  Op,
  Mem,
  Ctrl,
  Loc,
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
