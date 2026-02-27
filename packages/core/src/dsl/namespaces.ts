/**
 * Core DSL namespaces: Mod, Op, Mem, Ctrl, Loc.
 *
 * These five namespaces form the primary API surface of the generator DSL:
 * - **Mod** — Module-level declarations (functions, exports, imports, memory, globals, tables)
 * - **Op** — Arithmetic, comparison, bitwise, and type-conversion operations.
 *   Includes typed sub-namespaces (`Op.i64`, `Op.f64`, `Op.f32`, `Op.convert`).
 * - **Mem** — Memory access (load/store), constants (`i32`/`i64`/`f64`),
 *   and structured array helpers (`i32Array`, `i32Array2D`, `byteGrid`).
 * - **Ctrl** — Control flow: `if`/`while`/`for`/`range`/`switch`, raw blocks/loops, branches.
 * - **Loc** — Local variable operations: `get`, `set`, `tee`, `drop`, `return`.
 *
 * Also exports top-level constant helpers (`i32`, `i64`, `f64`).
 *
 * @module
 */
import { IR } from "../wasm/ir";
import type { ConvertKind, IRNode } from "../wasm/ir";
import { BumpAllocator } from "./allocator";
import type { WasmValType } from "../wasm/opcodes";
import { FieldAccessor } from "./struct";
import {
  val,
  WasmRef,
  type FuncRef,
  type FuncGen,
  type FuncBody,
  type FuncReturn,
  type FuncInstruction,
  type ModuleGen,
  type VoidBody,
  type VoidStmt,
  type WasmVal,
  type ModuleInstruction,
  type GlobalRef,
  type ScopeHandle,
} from "./types";
import {
  type ExprInput,
  type CallableFunc,
  ChainableExpr,
  IfBuilder,
  resolve,
  callableFunc,
  add,
  sub,
  mul,
  div,
  rem,
  eq,
  ne,
  lt,
  gt,
  le,
  ge,
  and_,
  or_,
  xor_,
  shl,
  shr,
  set,
  tee,
  select_,
  div_u,
  rem_u,
  shr_u,
  lt_u,
  gt_u,
  le_u,
  ge_u,
  makeBinopTyped,
  makeCmpTyped,
  makeUnary,
  makeConvert,
} from "./expr";
import { param as declareParam, local as declareLocal, Type } from "./declarations";

// --- Helpers ---

/** Normalizes a VoidBody (generator or array form) into a FuncBody<void>. */
function toBody(body: VoidBody): FuncBody<void> {
  return function* () {
    const r = body();
    if (Array.isArray(r)) {
      for (const s of r) yield* s;
    } else {
      yield* r;
    }
  };
}

/** Builds a FuncBody from either a plain body or a params record + callback. */
function buildBody(
  bodyOrParams: FuncBody<FuncReturn> | Record<string, WasmValType>,
  bodyWithParams?: (...refs: WasmRef<any>[]) => Generator<FuncInstruction, FuncReturn, any>,
): FuncBody<FuncReturn> {
  if (typeof bodyOrParams === "function") return bodyOrParams;
  const entries = Object.entries(bodyOrParams);
  for (const [key] of entries) {
    if (String(Number(key)) === key) {
      throw new Error(
        `Numeric key "${key}" in param record is not allowed (property order is unreliable)`,
      );
    }
  }
  return function* () {
    const refs: WasmRef<any>[] = [];
    for (const [, type] of entries) {
      refs.push(yield* declareParam(type));
    }
    return yield* bodyWithParams!(...refs);
  };
}

/**
 * Type-level interface for Mod with overloaded signatures for arity inference.
 *
 * The implementation object is cast via `as unknown as ModNamespace` because
 * its methods return `CallableFunc` (default `WasmValType[]`) while the
 * interface promises narrower types like `CallableFunc<[]>` or
 * `CallableFunc<["i32","i32"]>`. A direct `as ModNamespace` fails because
 * the `& ExprInput[]` intersection in CallableFunc makes it invariant in
 * Params, so `CallableFunc` (wide) is not assignable to `CallableFunc<[]>`.
 */
/** Options for Mod.func / Mod.exportFunc to declare expected return type (V-10). */
interface FuncOptions {
  results?: WasmValType[];
}

interface ModNamespace {
  func(body: FuncBody<FuncReturn>): ModuleGen<CallableFunc<[]>>;
  func<A extends WasmRef<any>[]>(
    params: Record<string, WasmValType>,
    body: (...refs: A) => Generator<FuncInstruction, FuncReturn, any>,
    options?: FuncOptions,
  ): ModuleGen<CallableFunc<{ [K in keyof A]: WasmValType }>>;

  export(name: string, funcref: FuncRef): ModuleGen<void>;

  import<P extends WasmValType[]>(
    moduleName: string,
    name: string,
    params: [...P],
    results: WasmValType[],
  ): ModuleGen<CallableFunc<P>>;

  exportAll(funcs: Record<string, FuncRef>): ModuleGen<void>;

  exportFunc(name: string, body: FuncBody<FuncReturn>): ModuleGen<CallableFunc<[]>>;
  exportFunc<A extends WasmRef<any>[]>(
    name: string,
    params: Record<string, WasmValType>,
    body: (...refs: A) => Generator<FuncInstruction, FuncReturn, any>,
    options?: FuncOptions,
  ): ModuleGen<CallableFunc<{ [K in keyof A]: WasmValType }>>;

  /**
   * `self` is typed as wide `CallableFunc` (no arity check) because:
   * 1. Giving `self` a mapped type `CallableFunc<{[K in keyof A]: WasmValType}>`
   *    creates a circular inference dependency — TS needs A to type self, but
   *    needs self's contextual type to infer A from the callback signature.
   * 2. Even if inference succeeded, CallableFunc invariance (from `& ExprInput[]`)
   *    would prevent `CallableFunc<["i32"]>` from being assignable to the
   *    contextually-expected `CallableFunc<WasmValType[]>`.
   */
  recursive(
    body: (self: CallableFunc) => Generator<FuncInstruction, FuncReturn, any>,
  ): ModuleGen<CallableFunc>;
  recursive<A extends WasmRef<any>[]>(
    params: Record<string, WasmValType>,
    body: (self: CallableFunc, ...refs: A) => Generator<FuncInstruction, FuncReturn, any>,
  ): ModuleGen<CallableFunc<{ [K in keyof A]: WasmValType }>>;

  data(offset: number, bytes: Uint8Array): ModuleGen<void>;
  dataString(offset: number, str: string): ModuleGen<void>;

  allocator(): BumpAllocator;

  table(funcs: FuncRef[]): ModuleGen<{
    call(index: ExprInput, ...args: ExprInput[]): FuncGen<WasmVal>;
    callVoid(index: ExprInput, ...args: ExprInput[]): FuncGen<void>;
  }>;

  use(fn: { body: FuncBody<FuncReturn> }): ModuleGen<CallableFunc>;

  useAll<S extends Record<string, { body: FuncBody<FuncReturn> }>>(
    fns: S,
  ): ModuleGen<{ [K in keyof S]: CallableFunc }>;

  importGroup<S extends Record<string, { params: WasmValType[]; results: WasmValType[] }>>(
    moduleName: string,
    specs: S,
  ): ModuleGen<{ [K in keyof S]: CallableFunc }>;

  memory(pages: number): ModuleGen<void>;

  start(funcRef: FuncRef): ModuleGen<void>;

  global<GT extends WasmValType = "i32">(
    type: GT,
    init: number,
    mutable?: boolean,
  ): ModuleGen<{
    get(): ChainableExpr<GT>;
    set(value: ExprInput): FuncGen<void>;
  }>;
}

/** Module-level declarations: functions, exports, imports, memory, globals. */
export const Mod = {
  /**
   * Declares a local function.
   *
   * Accepts either a plain body or a params record with a callback:
   * - `Mod.func(function* () { ... })`
   * - `Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) { ... })`
   */
  func(
    bodyOrParams: FuncBody<FuncReturn> | Record<string, WasmValType>,
    bodyWithParams?: (...refs: WasmRef<any>[]) => Generator<FuncInstruction, FuncReturn, any>,
    options?: { results?: WasmValType[] },
  ): ModuleGen<CallableFunc> {
    const body = buildBody(bodyOrParams, bodyWithParams);
    const paramCount =
      typeof bodyOrParams === "function" ? undefined : Object.keys(bodyOrParams).length;
    const declaredResults = options?.results;
    return (function* () {
      const r: FuncRef = yield { _type: "func", body, declaredResults };
      return callableFunc(r._idx, paramCount);
    })();
  },
  /** Exports a function with the given name. */
  export(name: string, funcref: FuncRef): ModuleGen<void> {
    return (function* () {
      yield { _type: "export", name, ref: funcref } as ModuleInstruction;
    })();
  },
  /** Declares an imported function from the host environment. */
  import(
    moduleName: string,
    name: string,
    params: WasmValType[],
    results: WasmValType[],
  ): ModuleGen<CallableFunc> {
    return (function* () {
      const r: FuncRef = yield {
        _type: "import_func",
        module: moduleName,
        name,
        params,
        results,
      };
      return callableFunc(r._idx, params.length, name);
    })();
  },
  /** Exports multiple functions at once. `Mod.exportAll({ add, sub })` */
  exportAll(funcs: Record<string, FuncRef>): ModuleGen<void> {
    return (function* () {
      for (const [name, ref] of Object.entries(funcs)) {
        yield { _type: "export", name, ref } as ModuleInstruction;
      }
    })();
  },
  /**
   * Declares and exports a function in one step.
   *
   * @example
   * ```ts
   * yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
   *   return yield* a.add(b);
   * });
   * ```
   */
  exportFunc(
    name: string,
    bodyOrParams: FuncBody<FuncReturn> | Record<string, WasmValType>,
    bodyWithParams?: (...refs: WasmRef<any>[]) => Generator<FuncInstruction, FuncReturn, any>,
    options?: { results?: WasmValType[] },
  ): ModuleGen<CallableFunc> {
    const body = buildBody(bodyOrParams, bodyWithParams);
    const paramCount =
      typeof bodyOrParams === "function" ? undefined : Object.keys(bodyOrParams).length;
    const declaredResults = options?.results;
    return (function* () {
      const r: FuncRef = yield { _type: "func", body, declaredResults };
      const fn = callableFunc(r._idx, paramCount, name);
      yield { _type: "export", name, ref: fn } as ModuleInstruction;
      return fn;
    })();
  },
  /**
   * Declares a recursive function with self-reference via a `self` parameter.
   * Eliminates the `let f: CallableFunc` forward-declaration pattern.
   *
   * @example
   * ```ts
   * const fib = yield* Mod.recursive(
   *   { n: Type.i32 },
   *   function* (self, n) { ... yield* self(n.sub(1)); },
   * );
   * ```
   */
  recursive(
    bodyOrParams:
      | ((self: CallableFunc) => Generator<FuncInstruction, FuncReturn, any>)
      | Record<string, WasmValType>,
    bodyWithParams?: (
      self: CallableFunc,
      ...refs: WasmRef<any>[]
    ) => Generator<FuncInstruction, FuncReturn, any>,
  ): ModuleGen<CallableFunc> {
    const paramCount =
      typeof bodyOrParams === "function" ? undefined : Object.keys(bodyOrParams).length;
    return (function* () {
      const r: FuncRef = yield {
        _type: "func",
        body: function* () {
          const self = callableFunc(r._idx, paramCount);
          if (typeof bodyOrParams === "function") {
            return yield* bodyOrParams(self);
          }
          const entries = Object.entries(bodyOrParams);
          for (const [key] of entries) {
            if (String(Number(key)) === key) {
              throw new Error(
                `Numeric key "${key}" in param record is not allowed (property order is unreliable)`,
              );
            }
          }
          const refs: WasmRef<any>[] = [];
          for (const [, type] of entries) {
            refs.push(yield* declareParam(type));
          }
          return yield* bodyWithParams!(self, ...refs);
        },
      };
      return callableFunc(r._idx, paramCount);
    })();
  },
  /**
   * Creates a function table for `call_indirect` dispatch.
   * All functions in the table should share the same signature.
   *
   * @returns Object with `call(index, ...args)` and `callVoid(index, ...args)`
   */
  table(funcs: FuncRef[]): ModuleGen<{
    call(index: ExprInput, ...args: ExprInput[]): FuncGen<WasmVal>;
    callVoid(index: ExprInput, ...args: ExprInput[]): FuncGen<void>;
  }> {
    const funcIndices = funcs.map((f) => f._idx);
    return (function* () {
      const tableIdx: number = yield { _type: "table", funcIndices } as ModuleInstruction;
      // The type index will be determined by the first function in the table.
      // Since all functions should have the same signature, we use the first one's index.
      const firstFuncIdx = funcIndices[0]!;

      return {
        call(index: ExprInput, ...args: ExprInput[]): FuncGen<WasmVal> {
          return (function* () {
            const resolvedArgs: IRNode[] = [];
            for (const arg of args) {
              const v = yield* resolve(arg);
              resolvedArgs.push(v._node);
            }
            const vi = yield* resolve(index);
            return val(IR.call_indirect(firstFuncIdx, tableIdx, resolvedArgs, vi._node));
          })();
        },
        callVoid(index: ExprInput, ...args: ExprInput[]): FuncGen<void> {
          return (function* () {
            const resolvedArgs: IRNode[] = [];
            for (const arg of args) {
              const v = yield* resolve(arg);
              resolvedArgs.push(v._node);
            }
            const vi = yield* resolve(index);
            yield {
              _type: "stmt",
              node: IR.call_indirect(firstFuncIdx, tableIdx, resolvedArgs, vi._node),
            } as FuncInstruction;
          })();
        },
      };
    })();
  },
  /** Imports a group of functions from a single module namespace. */
  importGroup(
    moduleName: string,
    specs: Record<string, { params: WasmValType[]; results: WasmValType[] }>,
  ): ModuleGen<Record<string, CallableFunc>> {
    return (function* () {
      const result: Record<string, CallableFunc> = {};
      for (const [name, spec] of Object.entries(specs)) {
        const r: FuncRef = yield {
          _type: "import_func",
          module: moduleName,
          name,
          params: spec.params,
          results: spec.results,
        };
        result[name] = callableFunc(r._idx, spec.params.length, name);
      }
      return result;
    })() as ModuleGen<Record<string, CallableFunc>>;
  },
  /** Embeds a stdlib function into the current module. */
  use(fn: { body: FuncBody<FuncReturn> }): ModuleGen<CallableFunc> {
    return (function* () {
      const r: FuncRef = yield { _type: "func", body: fn.body };
      return callableFunc(r._idx);
    })() as ModuleGen<CallableFunc>;
  },
  /** Embeds multiple stdlib functions into the current module at once. */
  useAll<S extends Record<string, { body: FuncBody<FuncReturn> }>>(
    fns: S,
  ): ModuleGen<{ [K in keyof S]: CallableFunc }> {
    return (function* () {
      const result = {} as { [K in keyof S]: CallableFunc };
      for (const [name, fn] of Object.entries(fns)) {
        const r: FuncRef = yield { _type: "func", body: fn.body };
        (result as any)[name] = callableFunc(r._idx);
      }
      return result;
    })() as ModuleGen<{ [K in keyof S]: CallableFunc }>;
  },
  /** Creates a compile-time bump allocator for automatic memory layout. */
  allocator(): BumpAllocator {
    return new BumpAllocator();
  },
  /** Embeds raw bytes into linear memory at the given offset via a data segment. */
  data(offset: number, bytes: Uint8Array): ModuleGen<void> {
    return (function* () {
      yield { _type: "data", offset, init: bytes } as ModuleInstruction;
    })();
  },
  /** Embeds a UTF-8 string into linear memory at the given offset via a data segment. */
  dataString(offset: number, str: string): ModuleGen<void> {
    return (function* () {
      yield { _type: "data", offset, init: new TextEncoder().encode(str) } as ModuleInstruction;
    })();
  },
  /** Declares linear memory with the given minimum page count (1 page = 64KB). */
  memory(pages: number): ModuleGen<void> {
    return (function* () {
      yield { _type: "memory", pages } as ModuleInstruction;
    })();
  },
  /** Sets the start function, which is called automatically on module instantiation. */
  start(funcRef: FuncRef): ModuleGen<void> {
    return (function* () {
      yield { _type: "start", ref: funcRef } as ModuleInstruction;
    })();
  },
  /** Declares a global variable with the given type and initial value. */
  global(type: WasmValType, init: number, mutable: boolean = true) {
    return (function* () {
      const ref: GlobalRef = yield {
        _type: "global",
        valType: type,
        init,
        mutable,
      } as ModuleInstruction;
      return {
        get() {
          return new ChainableExpr(
            (function* () {
              return val(IR.global_get(ref._idx));
            })(),
            type,
          );
        },
        set(value: ExprInput): FuncGen<void> {
          return (function* () {
            const vv = yield* resolve(value);
            yield { _type: "stmt", node: IR.global_set(ref._idx, vv._node) } as FuncInstruction;
          })();
        },
      };
    })();
  },
} as unknown as ModNamespace;

/** Arithmetic, comparison, bitwise, and conversion operations. */
export const Op = {
  // --- i32 signed ops (top-level shortcuts) ---
  add,
  sub,
  mul,
  div,
  rem,
  eq,
  ne,
  lt,
  gt,
  le,
  ge,
  and: and_,
  or: or_,
  xor: xor_,
  shl,
  shr,
  select: select_,
  /** Branchless maximum via `select`. `Op.max(a, b)` = `a > b ? a : b`. */
  max(a: ExprInput, b: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(a);
        const vb = yield* resolve(b);
        return val(IR.select(va._node, vb._node, IR.cmp("gt", va._node, vb._node)));
      })(),
    );
  },
  /** Branchless minimum via `select`. `Op.min(a, b)` = `a < b ? a : b`. */
  min(a: ExprInput, b: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(a);
        const vb = yield* resolve(b);
        return val(IR.select(va._node, vb._node, IR.cmp("lt", va._node, vb._node)));
      })(),
    );
  },

  // --- Unsigned i32 ops ---
  div_u,
  rem_u,
  shr_u,
  lt_u,
  gt_u,
  le_u,
  ge_u,

  // --- i32 sub-namespace ---
  i32: {
    clz: makeUnary("clz", "i32"),
    ctz: makeUnary("ctz", "i32"),
    popcnt: makeUnary("popcnt", "i32"),
    rotl: makeBinopTyped("rotl", "i32"),
    rotr: makeBinopTyped("rotr", "i32"),
    eqz(a: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        const va = yield* resolve(a);
        return val(IR.eqz(va._node));
      })();
    },
  },

  // --- i64 operations ---
  /** 64-bit integer operations. All ops take/return i64 except comparisons (→ i32). */
  i64: {
    add: makeBinopTyped("add", "i64"),
    sub: makeBinopTyped("sub", "i64"),
    mul: makeBinopTyped("mul", "i64"),
    div: makeBinopTyped("div", "i64"),
    rem: makeBinopTyped("rem", "i64"),
    and: makeBinopTyped("and", "i64"),
    or: makeBinopTyped("or", "i64"),
    xor: makeBinopTyped("xor", "i64"),
    shl: makeBinopTyped("shl", "i64"),
    shr: makeBinopTyped("shr", "i64"),
    div_u: makeBinopTyped("div_u", "i64"),
    rem_u: makeBinopTyped("rem_u", "i64"),
    shr_u: makeBinopTyped("shr_u", "i64"),
    rotl: makeBinopTyped("rotl", "i64"),
    rotr: makeBinopTyped("rotr", "i64"),
    clz: makeUnary("clz", "i64"),
    ctz: makeUnary("ctz", "i64"),
    popcnt: makeUnary("popcnt", "i64"),
    eq: makeCmpTyped("eq", "i64"),
    ne: makeCmpTyped("ne", "i64"),
    lt: makeCmpTyped("lt", "i64"),
    gt: makeCmpTyped("gt", "i64"),
    le: makeCmpTyped("le", "i64"),
    ge: makeCmpTyped("ge", "i64"),
    lt_u: makeCmpTyped("lt_u", "i64"),
    gt_u: makeCmpTyped("gt_u", "i64"),
    le_u: makeCmpTyped("le_u", "i64"),
    ge_u: makeCmpTyped("ge_u", "i64"),
    eqz(a: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        const va = yield* resolve(a);
        return val(IR.eqz(va._node, "i64"));
      })();
    },
  },

  // --- f32 operations ---
  /** 32-bit float operations: arithmetic, rounding, comparison. */
  f32: {
    add: makeBinopTyped("add", "f32"),
    sub: makeBinopTyped("sub", "f32"),
    mul: makeBinopTyped("mul", "f32"),
    div: makeBinopTyped("div", "f32"),
    min: makeBinopTyped("min", "f32"),
    max: makeBinopTyped("max", "f32"),
    copysign: makeBinopTyped("copysign", "f32"),
    abs: makeUnary("abs", "f32"),
    neg: makeUnary("neg", "f32"),
    ceil: makeUnary("ceil", "f32"),
    floor: makeUnary("floor", "f32"),
    trunc: makeUnary("trunc", "f32"),
    nearest: makeUnary("nearest", "f32"),
    sqrt: makeUnary("sqrt", "f32"),
    eq: makeCmpTyped("eq", "f32"),
    ne: makeCmpTyped("ne", "f32"),
    lt: makeCmpTyped("lt", "f32"),
    gt: makeCmpTyped("gt", "f32"),
    le: makeCmpTyped("le", "f32"),
    ge: makeCmpTyped("ge", "f32"),
  },

  // --- f64 operations ---
  /** 64-bit float operations: arithmetic, rounding, comparison. */
  f64: {
    add: makeBinopTyped("add", "f64"),
    sub: makeBinopTyped("sub", "f64"),
    mul: makeBinopTyped("mul", "f64"),
    div: makeBinopTyped("div", "f64"),
    min: makeBinopTyped("min", "f64"),
    max: makeBinopTyped("max", "f64"),
    copysign: makeBinopTyped("copysign", "f64"),
    abs: makeUnary("abs", "f64"),
    neg: makeUnary("neg", "f64"),
    ceil: makeUnary("ceil", "f64"),
    floor: makeUnary("floor", "f64"),
    trunc: makeUnary("trunc", "f64"),
    nearest: makeUnary("nearest", "f64"),
    sqrt: makeUnary("sqrt", "f64"),
    eq: makeCmpTyped("eq", "f64"),
    ne: makeCmpTyped("ne", "f64"),
    lt: makeCmpTyped("lt", "f64"),
    gt: makeCmpTyped("gt", "f64"),
    le: makeCmpTyped("le", "f64"),
    ge: makeCmpTyped("ge", "f64"),
  },

  // --- Conversion shortcuts ---
  /** Converts i64 to i32 (`i32.wrap_i64`). */
  wrap(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_wrap_i64(va._node));
    })();
  },
  /** Sign-extends i32 to i64 (`i64.extend_i32_s`). */
  extend(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i64_extend_i32_s(va._node));
    })();
  },
  /** Converts signed i32 to f64 (`f64.convert_i32_s`). */
  toF64(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.f64_convert_i32_s(va._node));
    })();
  },
  /** Truncates f64 to signed i32 (`i32.trunc_f64_s`). */
  truncI32(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_trunc_f64_s(va._node));
    })();
  },
  /** Converts signed i32 to f32 (`f32.convert_i32_s`). */
  toF32(a: ExprInput): FuncGen<WasmVal> {
    return makeConvert("f32_convert_i32_s")(a);
  },

  // --- All conversions namespace ---
  /** All Wasm numeric conversions as named functions (e.g. `Op.convert.f64_convert_i32_s`). */
  convert: Object.fromEntries(
    (
      [
        "i32_wrap_i64",
        "i32_trunc_f32_s",
        "i32_trunc_f32_u",
        "i32_trunc_f64_s",
        "i32_trunc_f64_u",
        "i64_extend_i32_s",
        "i64_extend_i32_u",
        "i64_trunc_f32_s",
        "i64_trunc_f32_u",
        "i64_trunc_f64_s",
        "i64_trunc_f64_u",
        "f32_convert_i32_s",
        "f32_convert_i32_u",
        "f32_convert_i64_s",
        "f32_convert_i64_u",
        "f32_demote_f64",
        "f64_convert_i32_s",
        "f64_convert_i32_u",
        "f64_convert_i64_s",
        "f64_convert_i64_u",
        "f64_promote_f32",
        "i32_reinterpret_f32",
        "i64_reinterpret_f64",
        "f32_reinterpret_i32",
        "f64_reinterpret_i64",
        // Sign-extension
        "i32_extend8_s",
        "i32_extend16_s",
        "i64_extend8_s",
        "i64_extend16_s",
        "i64_extend32_s",
      ] as ConvertKind[]
    ).map((k) => [k, makeConvert(k)]),
  ) as Record<ConvertKind, (a: ExprInput) => FuncGen<WasmVal>>,
};

/** Memory access, constants, and array helpers. */
export const Mem = {
  /** Loads an i32 from the given byte address. */
  load(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32(va._node));
      })(),
    );
  },
  /** Stores an i32 at the given byte address. */
  store(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
    })();
  },
  /** Loads a single byte (zero-extended to i32) from the given address. */
  load8(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32_8u(va._node));
      })(),
    );
  },
  /** Stores a single byte at the given address. */
  store8(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32_8(va._node, vv._node) };
    })();
  },
  /** Creates a chainable i32 constant expression. */
  i32(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i32(v));
      })(),
    );
  },
  /** Creates a chainable i64 constant expression. */
  i64(v: number): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i64(v));
      })(),
      "i64",
    );
  },
  /** Creates a chainable f32 constant expression. */
  f32(v: number): ChainableExpr<"f32"> {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_f32(v));
      })(),
      "f32",
    );
  },
  /** Creates a chainable f64 constant expression. */
  f64(v: number): ChainableExpr<"f64"> {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_f64(v));
      })(),
      "f64",
    );
  },
  // --- i64 memory ---
  loadI64(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i64(va._node));
      })(),
      "i64",
    );
  },
  storeI64(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i64(va._node, vv._node) };
    })();
  },
  // --- f32 memory ---
  loadF32(addr: ExprInput): ChainableExpr<"f32"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("f32_load", va._node));
      })(),
      "f32",
    );
  },
  storeF32(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.mem_store("f32_store", va._node, vv._node) };
    })();
  },
  // --- f64 memory ---
  loadF64(addr: ExprInput): ChainableExpr<"f64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_f64(va._node));
      })(),
      "f64",
    );
  },
  storeF64(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_f64(va._node, vv._node) };
    })();
  },
  // --- Narrow i32 loads ---
  load8s(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i32_load8_s", va._node));
      })(),
    );
  },
  load16s(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i32_load16_s", va._node));
      })(),
    );
  },
  load16u(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i32_load16_u", va._node));
      })(),
    );
  },
  store16(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.mem_store("i32_store16", va._node, vv._node) };
    })();
  },
  // --- Narrow i64 loads/stores ---
  loadI64_8s(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load8_s", va._node));
      })(),
      "i64",
    );
  },
  loadI64_8u(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load8_u", va._node));
      })(),
      "i64",
    );
  },
  loadI64_16s(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load16_s", va._node));
      })(),
      "i64",
    );
  },
  loadI64_16u(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load16_u", va._node));
      })(),
      "i64",
    );
  },
  loadI64_32s(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load32_s", va._node));
      })(),
      "i64",
    );
  },
  loadI64_32u(addr: ExprInput): ChainableExpr<"i64"> {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load32_u", va._node));
      })(),
      "i64",
    );
  },
  storeI64_8(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.mem_store("i64_store8", va._node, vv._node) };
    })();
  },
  storeI64_16(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.mem_store("i64_store16", va._node, vv._node) };
    })();
  },
  storeI64_32(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.mem_store("i64_store32", va._node, vv._node) };
    })();
  },
  /** Returns the current memory size in pages (`memory.size`). */
  size(): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.memory_size());
    })();
  },
  /** Grows memory by the given number of pages. Returns previous size or -1 on failure. */
  grow(pages: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const vp = yield* resolve(pages);
      return val(IR.memory_grow(vp._node));
    })();
  },
  /** Copies `len` bytes from `src` to `dst` in linear memory (bulk memory operation). */
  copy(dst: ExprInput, src: ExprInput, len: ExprInput): FuncGen<void> {
    return (function* () {
      const vd = yield* resolve(dst);
      const vs = yield* resolve(src);
      const vl = yield* resolve(len);
      yield { _type: "stmt", node: IR.memory_copy(vd._node, vs._node, vl._node) } as FuncInstruction;
    })();
  },
  /** Fills `len` bytes starting at `dst` with byte value `val` (bulk memory operation). */
  fill(dst: ExprInput, value: ExprInput, len: ExprInput): FuncGen<void> {
    return (function* () {
      const vd = yield* resolve(dst);
      const vv = yield* resolve(value);
      const vl = yield* resolve(len);
      yield { _type: "stmt", node: IR.memory_fill(vd._node, vv._node, vl._node) } as FuncInstruction;
    })();
  },
  /**
   * Creates an i32 array helper that hides `.mul(4)` byte addressing.
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @returns Object with `load(idx)`, `store(idx, val)`, `at(idx)`, `swap(i, j, tmp)`, `fill(start, end, val)`
   */
  i32Array(base: ExprInput = 0): {
    load(idx: ExprInput): ChainableExpr;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
    at(idx: ExprInput): FieldAccessor<"i32">;
    swap(i: ExprInput, j: ExprInput, tmp: WasmRef<"i32">): FuncGen<void>;
    fill(start: ExprInput, end: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 4));
      return typeof base === "number" && base === 0 ? scaled : scaled.add(base);
    };
    type I32Array = {
      load(idx: ExprInput): ChainableExpr;
      store(idx: ExprInput, value: ExprInput): FuncGen<void>;
      at(idx: ExprInput): FieldAccessor<"i32">;
      swap(i: ExprInput, j: ExprInput, tmp: WasmRef<"i32">): FuncGen<void>;
      fill(start: ExprInput, end: ExprInput, value: ExprInput): FuncGen<void>;
    };
    const arr: I32Array = {
      load: (idx: ExprInput): ChainableExpr => Mem.load(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput): FuncGen<void> => Mem.store(addrOf(idx), value),
      at: (idx: ExprInput): FieldAccessor<"i32"> => new FieldAccessor(addrOf(idx), "i32"),
      swap: (i: ExprInput, j: ExprInput, tmp: WasmRef): FuncGen<void> =>
        (function* () {
          yield* set(tmp, arr.load(i));
          yield* arr.store(i, arr.load(j));
          yield* arr.store(j, tmp);
        })(),
      fill: (startIdx: ExprInput, endIdx: ExprInput, value: ExprInput): FuncGen<void> =>
        (function* () {
          const idx: WasmRef = yield {
            _type: "decl" as const,
            kind: "local" as const,
            valType: "i32" as WasmValType,
          };
          yield* set(idx, startIdx);
          yield {
            _type: "block" as const,
            body: function* () {
              yield {
                _type: "loop" as const,
                body: function* () {
                  const vc = yield* resolve(gt(idx, endIdx));
                  yield { _type: "stmt" as const, node: IR.br_if(1, vc._node) };
                  yield* arr.store(idx, value);
                  yield* set(idx, add(idx, 1));
                  yield { _type: "stmt" as const, node: IR.br(0) };
                },
              };
            },
          };
        })(),
    };
    return arr;
  },
  /**
   * Creates a 2D i32 array helper. Computes `(row * cols + col) * 4 + base`.
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @param cols - Number of columns (can be a runtime expression)
   * @returns Object with `load(row, col)`, `store(row, col, val)`, `at(row, col)`
   */
  i32Array2D(
    base: ExprInput = 0,
    cols: ExprInput,
  ): {
    load(row: ExprInput, col: ExprInput): ChainableExpr;
    store(row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void>;
    at(row: ExprInput, col: ExprInput): FieldAccessor<"i32">;
  } {
    const flatIdx = (row: ExprInput, col: ExprInput): ChainableExpr =>
      new ChainableExpr(add(mul(row, cols), col));
    const addrOf = (row: ExprInput, col: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(flatIdx(row, col), 4));
      return typeof base === "number" && base === 0 ? scaled : scaled.add(base);
    };
    return {
      load: (row: ExprInput, col: ExprInput): ChainableExpr => Mem.load(addrOf(row, col)),
      store: (row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void> =>
        Mem.store(addrOf(row, col), value),
      at: (row: ExprInput, col: ExprInput): FieldAccessor<"i32"> =>
        new FieldAccessor(addrOf(row, col), "i32"),
    };
  },
  /**
   * Creates a 2D byte grid helper. Computes `row * cols + col + base`.
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @param cols - Number of columns (can be a runtime expression)
   * @returns Object with `load(row, col)`, `store(row, col, val)`, `at(row, col)`
   */
  byteGrid(
    base: ExprInput = 0,
    cols: ExprInput,
  ): {
    load(row: ExprInput, col: ExprInput): ChainableExpr;
    store(row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void>;
    at(row: ExprInput, col: ExprInput): FieldAccessor<"i32">;
  } {
    const addrOf = (row: ExprInput, col: ExprInput): ChainableExpr => {
      const flat = new ChainableExpr(add(mul(row, cols), col));
      return typeof base === "number" && base === 0 ? flat : flat.add(base);
    };
    return {
      load: (row: ExprInput, col: ExprInput): ChainableExpr => Mem.load8(addrOf(row, col)),
      store: (row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void> =>
        Mem.store8(addrOf(row, col), value),
      at: (row: ExprInput, col: ExprInput): FieldAccessor<"i32"> =>
        new FieldAccessor(addrOf(row, col), "u8"),
    };
  },
  /**
   * Creates a 3D byte grid helper. Computes `x + y*xSize + z*(xSize*ySize) + base`.
   * `xSize*ySize` is a compile-time constant (JS multiplication).
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @param xSize - Size of the X dimension (compile-time number)
   * @param ySize - Size of the Y dimension (compile-time number)
   * @returns Object with `load(x, y, z)`, `store(x, y, z, val)`, `at(x, y, z)`
   */
  byteGrid3D(
    base: ExprInput = 0,
    xSize: number,
    ySize: number,
  ): {
    load(x: ExprInput, y: ExprInput, z: ExprInput): ChainableExpr;
    store(x: ExprInput, y: ExprInput, z: ExprInput, value: ExprInput): FuncGen<void>;
    at(x: ExprInput, y: ExprInput, z: ExprInput): FieldAccessor<"i32">;
  } {
    const sliceSize = xSize * ySize;
    const addrOf = (x: ExprInput, y: ExprInput, z: ExprInput): ChainableExpr => {
      const flat = new ChainableExpr(add(x, add(mul(y, xSize), mul(z, sliceSize))));
      return typeof base === "number" && base === 0 ? flat : flat.add(base);
    };
    return {
      load: (x: ExprInput, y: ExprInput, z: ExprInput): ChainableExpr =>
        Mem.load8(addrOf(x, y, z)),
      store: (x: ExprInput, y: ExprInput, z: ExprInput, value: ExprInput): FuncGen<void> =>
        Mem.store8(addrOf(x, y, z), value),
      at: (x: ExprInput, y: ExprInput, z: ExprInput): FieldAccessor<"i32"> =>
        new FieldAccessor(addrOf(x, y, z), "u8"),
    };
  },
  /**
   * Creates an f32 array helper that hides `.mul(4)` byte addressing.
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @returns Object with `load(idx)`, `store(idx, val)`, `at(idx)`
   */
  f32Array(base: ExprInput = 0): {
    load(idx: ExprInput): ChainableExpr<"f32">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
    at(idx: ExprInput): FieldAccessor<"f32">;
  } {
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 4));
      return typeof base === "number" && base === 0 ? scaled : scaled.add(base);
    };
    return {
      load: (idx: ExprInput): ChainableExpr<"f32"> => Mem.loadF32(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput): FuncGen<void> => Mem.storeF32(addrOf(idx), value),
      at: (idx: ExprInput): FieldAccessor<"f32"> => new FieldAccessor(addrOf(idx), "f32"),
    };
  },
  /**
   * Creates an f64 array helper that hides `.mul(8)` byte addressing.
   *
   * @param base - Base byte offset (default 0, can be a runtime expression)
   * @returns Object with `load(idx)`, `store(idx, val)`, `at(idx)`
   */
  f64Array(base: ExprInput = 0): {
    load(idx: ExprInput): ChainableExpr<"f64">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
    at(idx: ExprInput): FieldAccessor<"f64">;
  } {
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 8));
      return typeof base === "number" && base === 0 ? scaled : scaled.add(base);
    };
    return {
      load: (idx: ExprInput): ChainableExpr<"f64"> => Mem.loadF64(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput): FuncGen<void> => Mem.storeF64(addrOf(idx), value),
      at: (idx: ExprInput): FieldAccessor<"f64"> => new FieldAccessor(addrOf(idx), "f64"),
    };
  },
};

// --- Switch builder ---

/** Internal implementation: emits switch IR from pre-collected cases. */
function switchImpl(
  expr: ExprInput,
  cases: { value: number; body: FuncBody<void> }[],
  normalizedDefault?: FuncBody<void>,
): FuncGen<void> {
  // Dense check: at least 3 cases with contiguous integer values
  if (cases.length >= 3) {
    const vals = cases.map((c) => c.value);
    const minVal = Math.min(...vals);
    const maxVal = Math.max(...vals);
    const isDense = maxVal - minVal + 1 === cases.length && new Set(vals).size === cases.length;

    if (isDense) {
      const sorted = [...cases].sort((a, b) => a.value - b.value);
      const n = sorted.length;
      const hasDefault = normalizedDefault != null;

      return (function* () {
        yield {
          _type: "block" as const,
          body: function* () {
            const emitCases = function* (): Generator<FuncInstruction, void, any> {
              const buildBlocks = (depth: number): FuncBody<void> => {
                if (depth === n) {
                  return function* () {
                    const ve = yield* resolve(expr);
                    const adjusted = minVal === 0 ? ve : yield* resolve(sub(ve, minVal));
                    const labels = sorted.map((_, i) => n - 1 - i);
                    yield {
                      _type: "stmt" as const,
                      node: IR.br_table(labels, n, adjusted._node),
                    };
                  };
                }
                const inner = buildBlocks(depth + 1);
                return function* () {
                  yield { _type: "block" as const, body: inner };
                  yield* sorted[depth]!.body();
                  yield { _type: "stmt" as const, node: IR.br(depth + (hasDefault ? 1 : 0)) };
                };
              };
              yield* buildBlocks(0)();
            };

            if (hasDefault) {
              yield {
                _type: "block" as const,
                body: function* () {
                  yield* emitCases();
                },
              };
              yield* normalizedDefault!();
            } else {
              yield* emitCases();
            }
          },
        };
      })();
    }
  }

  // Sparse: fallback to if/else chain
  return (function* () {
    const buildChain = (i: number): FuncBody<void> | undefined => {
      if (i >= cases.length) return normalizedDefault;
      const c = cases[i]!;
      const rest = buildChain(i + 1);
      return function* () {
        const ve = yield* resolve(expr);
        const vc = yield* resolve(eq(ve, c.value));
        yield {
          _type: "if" as const,
          cond: vc._node,
          then_: c.body,
          else_: rest,
        };
      };
    };
    const chain = buildChain(0);
    if (chain) yield* chain();
  })();
}

/** Initial switch builder. Requires at least one `.case()` call before execution. */
export class SwitchBuilder {
  constructor(private readonly _expr: ExprInput) {}
  case(value: number, body: VoidBody): SwitchCaseBuilder {
    return new SwitchCaseBuilder(this._expr, [{ value, body: toBody(body) }]);
  }
}

/** Switch builder with one or more cases. Can add more `.case()` calls, chain `.default()`, or execute directly via `yield*`. */
export class SwitchCaseBuilder {
  constructor(
    private readonly _expr: ExprInput,
    private readonly _cases: { value: number; body: FuncBody<void> }[],
  ) {}
  case(value: number, body: VoidBody): SwitchCaseBuilder {
    return new SwitchCaseBuilder(this._expr, [...this._cases, { value, body: toBody(body) }]);
  }
  default(body: VoidBody): SwitchDefaultBuilder {
    return new SwitchDefaultBuilder(this._expr, this._cases, toBody(body));
  }
  [Symbol.iterator](): Generator<FuncInstruction, void, any> {
    return switchImpl(this._expr, this._cases);
  }
}

/** Terminal switch builder with a default case. Execute via `yield*`. */
export class SwitchDefaultBuilder {
  constructor(
    private readonly _expr: ExprInput,
    private readonly _cases: { value: number; body: FuncBody<void> }[],
    private readonly _default: FuncBody<void>,
  ) {}
  [Symbol.iterator](): Generator<FuncInstruction, void, any> {
    return switchImpl(this._expr, this._cases, this._default);
  }
}

/** Control flow: branching, loops, blocks, and structured sugar. */
export const Ctrl = {
  /** Starts a conditional branch. Chain with `.then()` and optionally `.else()`. */
  if(cond: ExprInput): IfBuilder {
    return new IfBuilder(cond);
  },
  /** Raw Wasm loop block. Prefer `Ctrl.for` or `Ctrl.while` for structured loops. */
  loop(body: VoidBody): FuncGen<void> {
    return (function* () {
      yield { _type: "loop", body: toBody(body) };
    })();
  },
  /** Raw Wasm block. Use `br(depth)` to break out. */
  block(body: VoidBody): FuncGen<void> {
    return (function* () {
      yield { _type: "block", body: toBody(body) };
    })();
  },
  /** Unconditional branch to the enclosing block/loop at the given depth. */
  br(depth: number): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.br(depth) };
    })();
  },
  /** Conditional branch. Branches if `cond` is truthy. */
  br_if(depth: number, cond: ExprInput): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
    })();
  },
  /** Multi-way branch table. Branches to `labels[expr]` or `default_` if out of range. */
  br_table(expr: ExprInput, labels: number[], default_: number): FuncGen<void> {
    return (function* () {
      const ve = yield* resolve(expr);
      yield { _type: "stmt", node: IR.br_table(labels, default_, ve._node) };
    })();
  },
  /** While loop. Repeats `body` as long as `cond` is truthy. Expands to `block { loop { br_if; ...; br } }`. */
  while(cond: ExprInput, body: VoidBody): FuncGen<void> {
    const nb = toBody(body);
    return (function* () {
      yield {
        _type: "block" as const,
        body: function* () {
          yield {
            _type: "loop" as const,
            body: function* () {
              const vc = yield* resolve(cond);
              yield { _type: "stmt" as const, node: IR.br_if(1, IR.eqz(vc._node)) };
              yield* nb();
              yield { _type: "stmt" as const, node: IR.br(0) };
            },
          };
        },
      };
    })();
  },
  /**
   * For loop sugar. `Ctrl.for(i, 0, i.lt(n), i.add(1), body)` is equivalent to `for (i = 0; i < n; i++)`.
   *
   * @param variable - Loop variable (must be a declared local)
   * @param start - Initial value
   * @param cond - Continue condition (checked before each iteration)
   * @param step - Step expression (applied after each iteration)
   * @param body - Loop body
   */
  for(
    variable: WasmRef,
    start: ExprInput,
    cond: ExprInput,
    step: ExprInput,
    body: VoidBody,
  ): FuncGen<void> {
    const nb = toBody(body);
    return (function* () {
      yield* set(variable, start);
      yield {
        _type: "block" as const,
        body: function* () {
          yield {
            _type: "loop" as const,
            body: function* () {
              const vc = yield* resolve(cond);
              yield { _type: "stmt" as const, node: IR.br_if(1, IR.eqz(vc._node)) };
              yield* nb();
              yield* set(variable, step);
              yield { _type: "stmt" as const, node: IR.br(0) };
            },
          };
        },
      };
    })();
  },
  /** Void-only conditional. Short for `if(cond).then(body)` without `.else()` or return value. */
  when(cond: ExprInput, body: VoidBody): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield {
        _type: "if" as const,
        cond: vc._node,
        then_: toBody(body),
      };
    })();
  },
  /**
   * Range-based for loop. Iterates `variable` from `start` (inclusive) to `end` (exclusive) with step +1.
   *
   * - 3 args: `range(i, n, body)` → `for (i = 0; i < n; i++)`
   * - 4 args: `range(i, start, end, body)` → `for (i = start; i < end; i++)`
   */
  range(
    variable: WasmRef,
    startOrEnd: ExprInput,
    endOrBody: ExprInput | VoidBody,
    maybeBody?: VoidBody,
  ): FuncGen<void> {
    if (typeof endOrBody === "function") {
      // 3-arg form: range(i, n, body) → for(i, 0, i.lt(n), i.add(1), body)
      return Ctrl.for(variable, 0, variable.lt(startOrEnd), variable.add(1), endOrBody as VoidBody);
    }
    // 4-arg form: range(i, start, end, body)
    return Ctrl.for(variable, startOrEnd, variable.lt(endOrBody), variable.add(1), maybeBody!);
  },
  /**
   * N-dimensional nested loop. Allocates loop variables automatically.
   *
   * @example
   * ```ts
   * yield* Ctrl.grid([h, w], (y, x) => [
   *   gridB.store(y, x, compute(y, x)),
   * ]);
   * ```
   */
  grid(
    dims: ExprInput[],
    body: (...vars: WasmRef<"i32">[]) => VoidStmt[],
  ): FuncGen<void> {
    return (function* () {
      const vars: WasmRef<"i32">[] = [];
      for (let i = 0; i < dims.length; i++) {
        vars.push(yield* declareLocal(Type.i32));
      }

      if (dims.length === 0) {
        for (const s of body()) yield* s;
        return;
      }

      const nest = (d: number): FuncGen<void> => {
        if (d === dims.length - 1) {
          return Ctrl.range(vars[d]!, dims[d]!, () => body(...vars));
        }
        return Ctrl.range(vars[d]!, dims[d]!, function* () {
          yield* nest(d + 1);
        });
      };

      yield* nest(0);
    })();
  },
  /** Multi-way switch builder. Chain with `.case()` and optionally `.default()`. */
  switch(expr: ExprInput): SwitchBuilder {
    return new SwitchBuilder(expr);
  },
  /** No-op instruction. */
  nop(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.nop() };
    })();
  },
  /** Emits a side-effect (writes tag + payload to mem[0..8] and returns -1). */
  effect(tag: number, payload: ExprInput): FuncGen<void> {
    return (function* () {
      const vp = yield* resolve(payload);
      yield { _type: "stmt", node: IR.effect(tag, vp._node) };
    })();
  },
  /** Triggers a Wasm trap (unreachable instruction). */
  unreachable(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.unreachable() };
    })();
  },
  /**
   * Scoped resource management with deferred cleanup.
   *
   * `scope.defer(cleanup)` registers a generator to run when the scope exits (LIFO order).
   * The body's `yield*` statements pass through transparently via generator delegation.
   *
   * @example
   * ```ts
   * yield* Ctrl.scope(function* (scope) {
   *   const buf = yield* local(Type.i32, 0);
   *   scope.defer(Mem.store(buf, 0));  // cleanup: zero the buffer
   *   yield* Mem.store(buf, 42);
   * });
   * // after scope: buf is zeroed
   * ```
   */
  scope(
    body: (scope: ScopeHandle) => Generator<FuncInstruction, void, any>,
  ): FuncGen<void> {
    return (function* () {
      const deferred: FuncGen<void>[] = [];
      const handle: ScopeHandle = {
        defer(cleanup) {
          deferred.push(cleanup);
        },
      };
      yield* body(handle);
      for (let i = deferred.length - 1; i >= 0; i--) {
        yield* deferred[i]!;
      }
    })();
  },
};

// --- Top-level constant helpers ---

/** Creates a chainable i32 constant. `i32(1).shl(col)` instead of `Mem.i32(1).shl(col)`. */
export const i32 = Mem.i32;

/** Creates a chainable i64 constant. */
export const i64 = Mem.i64;

/** Creates a chainable f32 constant. */
export const f32 = Mem.f32;

/** Creates a chainable f64 constant. */
export const f64 = Mem.f64;

/** Local variable operations (get, set, tee, drop, return). */
export const Loc = {
  /** Reads a local variable's value. With implicit return coercion, `return r` often suffices. */
  get(r: WasmRef): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.local_get(r._idx));
    })();
  },
  set,
  tee,
  /** Evaluates an expression and discards its result. */
  drop(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.drop(v._node) };
    })();
  },
  /** Early return from the current function with the given value. */
  return(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.return_(v._node) };
    })();
  },
};
