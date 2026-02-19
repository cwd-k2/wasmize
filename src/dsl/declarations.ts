import type { WasmValType } from "../wasm/opcodes";
import { WasmRef, type FuncGen } from "./types";
import { type ExprInput, set } from "./expr";

/**
 * Declares a function parameter of the given type.
 */
export function param<T extends WasmValType>(type: T): FuncGen<WasmRef<T>> {
  return (function* () {
    const r = yield { _type: "decl", kind: "param", valType: type } as const;
    return r as WasmRef<T>;
  })();
}

/**
 * Declares a local variable of the given type.
 * Optionally accepts an initial value expression.
 *
 * @param type - The Wasm value type
 * @param init - Optional initial value (Wasm locals default to 0)
 */
export function local<T extends WasmValType>(type: T, init?: ExprInput): FuncGen<WasmRef<T>> {
  return (function* () {
    const r = yield { _type: "decl", kind: "local", valType: type } as const;
    const ref = r as WasmRef<T>;
    if (init !== undefined) {
      yield* set(ref, init);
    }
    return ref;
  })();
}

/** Wasm value type constants for use with `param()` and `local()`. */
export const Type = { i32: "i32", i64: "i64", f64: "f64" } as const;
