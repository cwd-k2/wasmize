import type { WasmValType } from "../wasm/opcodes";
import { WasmRef, type FuncGen } from "./types";

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
 * Declares a local variable of the given type, initialized to zero.
 */
export function local(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "local", valType: type };
    return r;
  })();
}

/** Wasm value type constants for use with `param()` and `local()`. */
export const Type = { i32: "i32", i64: "i64", f64: "f64" } as const;
