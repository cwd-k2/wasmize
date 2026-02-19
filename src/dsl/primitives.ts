// Side-effect: augments WasmRef.prototype with chainable methods
import "./augment";

export {
  type ExprInput,
  type CallableFunc,
  ChainableExpr,
  ThenBuilder,
} from "./expr";

export { param, local, Type } from "./declarations";

export { Mod, Op, Mem, Ctrl, Loc, SwitchCaseBuilder, SwitchDefaultBuilder } from "./namespaces";
export { BumpAllocator } from "./allocator";
export { Struct } from "./struct";
export { Str } from "./string";

// Top-level constant helpers (chainable, shorter than Mem.i32/f64/i64)
export { i32, i64, f64 } from "./namespaces";
