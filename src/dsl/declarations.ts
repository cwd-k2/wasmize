import type { WasmValType } from "../wasm/opcodes";
import { WasmRef, type FuncGen } from "./types";
import { type ExprInput, set } from "./expr";

/**
 * Declares a function parameter of the given type.
 */
export function param(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "param", valType: type };
    return r;
  })();
}

/**
 * Declares a local variable of the given type.
 * Optionally accepts an initial value expression.
 *
 * @param type - The Wasm value type
 * @param init - Optional initial value (Wasm locals default to 0)
 */
export function local(type: WasmValType, init?: ExprInput): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "local", valType: type };
    if (init !== undefined) {
      yield* set(r, init);
    }
    return r;
  })();
}

/** Wasm value type constants for use with `param()` and `local()`. */
export const Type = { i32: "i32", i64: "i64", f64: "f64" } as const;
