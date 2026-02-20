/**
 * Public API entry point.
 *
 * Re-exports the DSL (compile, namespaces, primitives), data structures
 * (Struct, Str, BumpAllocator), high-level APIs (wasmFunc, wasmize),
 * and runtime utilities (instantiate, marshal).
 *
 * @module
 */
// Side-effect: WasmRef prototype augmentation (must be first)
import "./dsl/augment";

// Core DSL (re-export from compiler barrel)
export {
  compile,
  param,
  local,
  Type,
  ChainableExpr,
  ThenBuilder,
  ElseIfBuilder,
  type ExprInput,
  type CallableFunc,
  Mod,
  Op,
  Mem,
  Ctrl,
  Loc,
  i32,
  i64,
  f64,
  Meta,
  RGBA,
  Queue,
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
  intercept,
  interceptIR,
  withTrace,
  interceptModule,
  composeIntercepts,
  interceptFilter,
  interceptWhen,
  type TraceEntry,
} from "./dsl/compiler";

// Data structures
export { Struct, FieldAccessor, type FieldType, type FieldSpec } from "./dsl/struct";
export { Str } from "./dsl/string";
export { BumpAllocator } from "./dsl/allocator";

// Instrumentation
export { createProfile, withProfiling, type InstructionProfile } from "./dsl/instrument";
export { withBoundsCheck } from "./dsl/guard";

// High-level APIs
export { wasmFunc } from "./inline";
export { wasmize } from "./declarative";

// Runtime utilities
export { instantiate } from "./runtime/instantiate";
export {
  writeI32Array,
  readI32Array,
  writeF64Array,
  readF64Array,
  writeString,
  readString,
  roundtrip,
} from "./runtime/marshal";
