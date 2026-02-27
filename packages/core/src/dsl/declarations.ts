/**
 * Parameter and local variable declaration primitives.
 *
 * {@link param} and {@link local} yield `decl` instructions to the
 * interpreter, which assigns local indices and returns typed `WasmRef`
 * handles. {@link Type} provides value type constants for convenience.
 *
 * @module
 */
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

/**
 * Spec for each local: bare type string or `[type, init]` tuple.
 *
 * @example
 * ```ts
 * "i32"           // no init
 * ["i32", 0]      // with init value
 * ["f64", 3.14]   // f64 with init
 * ```
 */
export type LocalSpec = WasmValType | readonly [WasmValType, ExprInput];

/** Extracts the WasmValType from a LocalSpec. */
type SpecType<S> = S extends readonly [infer V, any] ? V & WasmValType : S & WasmValType;

/**
 * Declares multiple local variables at once.
 * Each argument is either a type string or a `[type, init]` tuple.
 * Returns a tuple of WasmRef handles matching the given specs.
 *
 * @example
 * ```ts
 * const [x, y, z] = yield* locals("i32", "i32", "f64");
 * const [i, sum]  = yield* locals(["i32", 0], ["i32", 0]);
 * ```
 */
export function locals<const T extends LocalSpec[]>(
  ...specs: T
): FuncGen<{ [K in keyof T]: WasmRef<SpecType<T[K]>> }> {
  return (function* () {
    const refs: WasmRef[] = [];
    for (const spec of specs) {
      const isArr = Array.isArray(spec);
      const type = isArr ? spec[0] : spec;
      const r = yield { _type: "decl", kind: "local", valType: type } as const;
      const ref = r as WasmRef;
      if (isArr) {
        yield* set(ref, spec[1] as ExprInput);
      }
      refs.push(ref);
    }
    return refs as any;
  })();
}

/** Wasm value type constants for use with `param()` and `local()`. */
export const Type = { i32: "i32", i64: "i64", f32: "f32", f64: "f64" } as const;
