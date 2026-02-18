// Side-effect: augments WasmRef.prototype with chainable methods
import "./augment";

export {
  type ExprInput,
  type CallableFunc,
  ChainableExpr,
  ThenBuilder,
} from "./expr";

export { param, local, Type } from "./declarations";

export { Mod, Op, Mem, Ctrl, Loc } from "./namespaces";
