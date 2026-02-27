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
export { sortI32, sortWith, mergeSort } from "./sort";
export { isPowerOf2, log2Floor, nextPowerOf2Func, bswap32 } from "./bits";
export { binarySearch, lowerBound, upperBound } from "./search";
export { usePrng, type PrngHandle } from "./prng";
export { sin, cos, tan, atan2 } from "./trig";
export { log, log2, exp, pow_f64 } from "./math-f64";
export { kmpBuildFailure, kmpSearch } from "./string-algo";
export { matTranspose, matMulF64, matScale } from "./matrix";
export { rgbToHsl, hslToRgb } from "./color";
export { fixedFromInt, fixedFromF64, fixedToF64, fixedAdd, fixedSub, fixedMul, fixedDiv } from "./fixed";
export { modpow, modinv } from "./modular";
export { countingSort, radixSort } from "./sort-int";
