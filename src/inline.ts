import { compile } from "./dsl/compiler";
import { Mod } from "./dsl/primitives";
import { BumpAllocator } from "./dsl/allocator";
import type { WasmRef, FuncInstruction, FuncReturn } from "./dsl/types";
import type { WasmValType } from "./wasm/opcodes";
import { instantiate } from "./test-helpers";
import { writeI32Array, writeF64Array } from "./marshal";

type ScalarType = "i32" | "i64" | "f64";
type ParamType = ScalarType | "i32[]" | "f64[]";
type ParamSpec = Record<string, ParamType>;

type ResultType = "i32" | "f64" | "void";

type JSResult<R extends ResultType> = R extends "i32" ? number : R extends "f64" ? number : void;

// Cache compiled modules by body function identity
const cache = new WeakMap<
  Function,
  Promise<{ instance: WebAssembly.Instance; memory?: WebAssembly.Memory }>
>();

/**
 * Compiles a single function to Wasm and returns a callable JS wrapper.
 * Array parameters are automatically marshaled to/from Wasm linear memory.
 *
 * @example
 * ```ts
 * const add = await wasmFunc(
 *   { a: "i32", b: "i32" },
 *   "i32",
 *   function* (a, b) { return yield* a.add(b); },
 * );
 * add(1, 2); // 3
 * ```
 */
export async function wasmFunc<P extends ParamSpec, R extends ResultType>(
  params: P,
  _result: R,
  body: (...args: WasmRef[]) => Generator<FuncInstruction, FuncReturn, any>,
  options?: { cache?: boolean },
): Promise<(...args: any[]) => JSResult<R>> {
  const useCache = options?.cache !== false;

  const entries = Object.entries(params);
  const scalarParams: { name: string; type: ScalarType }[] = [];
  const arrayParams: { name: string; elementType: "i32" | "f64"; paramIdx: number }[] = [];

  // Separate scalar and array parameters
  for (const [name, type] of entries) {
    if (type === "i32[]" || type === "f64[]") {
      const elemType = type === "i32[]" ? "i32" : "f64";
      arrayParams.push({ name, elementType: elemType, paramIdx: entries.indexOf([name, type]) });
      // Array params become (ptr, len) pairs in Wasm
      scalarParams.push({ name: `${name}_ptr`, type: "i32" });
      scalarParams.push({ name: `${name}_len`, type: "i32" });
    } else {
      scalarParams.push({ name, type });
    }
  }

  // Build allocator for array regions
  const alloc = new BumpAllocator();
  const arrayRegions: {
    name: string;
    elementType: "i32" | "f64";
    base: number;
    maxCount: number;
  }[] = [];

  for (const ap of arrayParams) {
    const maxCount = 1024; // default max array size
    const elemSize = ap.elementType === "i32" ? 4 : 8;
    const base = alloc.alloc(maxCount * elemSize, elemSize);
    arrayRegions.push({ name: ap.name, elementType: ap.elementType, base, maxCount });
  }

  // Build Wasm params record
  const wasmParams: Record<string, WasmValType> = {};
  for (const sp of scalarParams) {
    wasmParams[sp.name] = sp.type;
  }

  const binary = compile(function* () {
    const pages = Math.max(alloc.requiredPages, 1);
    yield* Mod.memory(pages);

    yield* Mod.exportFunc("_run", wasmParams, function* (...refs) {
      // If there are array params, create array helpers and map refs
      // For now, pass all refs directly to the user body
      return yield* body(...refs);
    });
  });

  // Instantiate (with optional caching)
  let instancePromise: Promise<{ instance: WebAssembly.Instance; memory?: WebAssembly.Memory }>;

  if (useCache && cache.has(body)) {
    instancePromise = cache.get(body)!;
  } else {
    instancePromise = instantiate(binary).then(({ exports }) => {
      const memory = (exports as any).memory as WebAssembly.Memory | undefined;
      return { instance: { exports } as any, memory };
    });
    if (useCache) {
      cache.set(body, instancePromise);
    }
  }

  const { instance, memory } = await instancePromise;
  const runFn = (instance.exports as any)._run as Function;

  if (arrayParams.length === 0) {
    // Simple scalar-only case: no marshaling needed
    return runFn as any;
  }

  // Build wrapper with marshaling
  return ((...args: any[]): JSResult<R> => {
    const wasmArgs: any[] = [];
    let paramIdx = 0;

    for (const [, type] of entries) {
      if (type === "i32[]" || type === "f64[]") {
        const arr = args[paramIdx] as number[];
        const region = arrayRegions.find((r) => r.name === entries[paramIdx]![0])!;

        if (memory) {
          const bytes = new Uint8Array(memory.buffer);
          const mem32 = new Int32Array(memory.buffer);
          if (type === "i32[]") {
            writeI32Array(mem32, region.base / 4, arr);
          } else {
            writeF64Array(bytes, region.base, arr);
          }
        }
        wasmArgs.push(region.base, arr.length);
      } else {
        wasmArgs.push(args[paramIdx]);
      }
      paramIdx++;
    }

    return runFn(...wasmArgs);
  }) as any;
}
