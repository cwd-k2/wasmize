import type { WasmValType } from "../wasm/opcodes";
import type { FuncBody, FuncReturn, ModuleGen } from "../dsl/types";
import type { CallableFunc } from "../dsl/expr";
import { Mod } from "../dsl/namespaces";

/**
 * A reusable Wasm function definition that can be embedded into any module.
 * Use `Mod.use(stdlibFunc)` to embed and get a callable reference.
 */
export interface StdlibFunc {
  readonly params: WasmValType[];
  readonly results: WasmValType[];
  readonly body: FuncBody<FuncReturn>;
}

/**
 * Embeds a stdlib function into the current module, returning a callable reference.
 */
export function use(fn: StdlibFunc): ModuleGen<CallableFunc> {
  return Mod.func(fn.body) as ModuleGen<CallableFunc>;
}

// Individual stdlib functions
export { memcpy, memset, memcmp } from "./mem";
export { pow, clamp, abs, lerp, gcd, lcm, gcdI64 } from "./math";
export { sortI32, sortWith } from "./sort";
export { isPowerOf2, log2Floor, nextPowerOf2Func, bswap32 } from "./bits";
