import { IR } from "../wasm/ir";
import type { ConvertKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  WasmRef,
  type FuncRef,
  type FuncGen,
  type FuncBody,
  type FuncInstruction,
  type ModuleGen,
  type VoidBody,
  type WasmVal,
  type ModuleInstruction,
  type GlobalRef,
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
import { param as declareParam } from "./declarations";

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
  bodyOrParams: FuncBody<WasmVal | void> | Record<string, WasmValType>,
  bodyWithParams?: (
    ...refs: WasmRef[]
  ) => Generator<FuncInstruction, WasmVal | void, any>,
): FuncBody<WasmVal | void> {
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
    const refs: WasmRef[] = [];
    for (const [, type] of entries) {
      refs.push(yield* declareParam(type));
    }
    return yield* bodyWithParams!(...refs);
  };
}

/** Module-level declarations: functions, exports, imports, memory. */
export const Mod = {
  func(
    bodyOrParams: FuncBody<WasmVal | void> | Record<string, WasmValType>,
    bodyWithParams?: (
      ...refs: WasmRef[]
    ) => Generator<FuncInstruction, WasmVal | void, any>,
  ): ModuleGen<CallableFunc> {
    const body = buildBody(bodyOrParams, bodyWithParams);
    return (function* () {
      const r: FuncRef = yield { _type: "func", body };
      return callableFunc(r._idx);
    })();
  },
  export(name: string, funcref: FuncRef): ModuleGen<void> {
    return (function* () {
      yield { _type: "export", name, ref: funcref } as ModuleInstruction;
    })();
  },
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
      return callableFunc(r._idx);
    })();
  },
  exportAll(funcs: Record<string, FuncRef>): ModuleGen<void> {
    return (function* () {
      for (const [name, ref] of Object.entries(funcs)) {
        yield { _type: "export", name, ref } as ModuleInstruction;
      }
    })();
  },
  exportFunc(
    name: string,
    bodyOrParams: FuncBody<WasmVal | void> | Record<string, WasmValType>,
    bodyWithParams?: (
      ...refs: WasmRef[]
    ) => Generator<FuncInstruction, WasmVal | void, any>,
  ): ModuleGen<CallableFunc> {
    const body = buildBody(bodyOrParams, bodyWithParams);
    return (function* () {
      const r: FuncRef = yield { _type: "func", body };
      const fn = callableFunc(r._idx);
      yield { _type: "export", name, ref: fn } as ModuleInstruction;
      return fn;
    })();
  },
  recursive(
    bodyOrParams:
      | ((
          self: CallableFunc,
        ) => Generator<FuncInstruction, WasmVal | void, any>)
      | Record<string, WasmValType>,
    bodyWithParams?: (
      self: CallableFunc,
      ...refs: WasmRef[]
    ) => Generator<FuncInstruction, WasmVal | void, any>,
  ): ModuleGen<CallableFunc> {
    return (function* () {
      const r: FuncRef = yield {
        _type: "func",
        body: function* () {
          const self = callableFunc(r._idx);
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
          const refs: WasmRef[] = [];
          for (const [, type] of entries) {
            refs.push(yield* declareParam(type));
          }
          return yield* bodyWithParams!(self, ...refs);
        },
      };
      return callableFunc(r._idx);
    })();
  },
  memory(pages: number): ModuleGen<void> {
    return (function* () {
      yield { _type: "memory", pages } as ModuleInstruction;
    })();
  },
  global(
    type: WasmValType,
    init: number,
    mutable: boolean = true,
  ): ModuleGen<{
    get(): ChainableExpr;
    set(value: ExprInput): FuncGen<void>;
  }> {
    return (function* () {
      const ref: GlobalRef = yield { _type: "global", valType: type, init, mutable } as ModuleInstruction;
      return {
        get(): ChainableExpr {
          return new ChainableExpr(
            (function* () {
              return val(IR.global_get(ref._idx));
            })(),
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
};

/** Arithmetic, comparison, bitwise, and conversion operations. */
export const Op = {
  // --- i32 signed ops (top-level shortcuts) ---
  add, sub, mul, div, rem,
  eq, ne, lt, gt, le, ge,
  and: and_, or: or_, xor: xor_, shl, shr,
  select: select_,
  max(a: ExprInput, b: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(a);
        const vb = yield* resolve(b);
        return val(IR.select(va._node, vb._node, IR.cmp("gt", va._node, vb._node)));
      })(),
    );
  },
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
  div_u, rem_u, shr_u, lt_u, gt_u, le_u, ge_u,

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
  wrap(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_wrap_i64(va._node));
    })();
  },
  extend(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i64_extend_i32_s(va._node));
    })();
  },
  toF64(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.f64_convert_i32_s(va._node));
    })();
  },
  truncI32(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_trunc_f64_s(va._node));
    })();
  },
  toF32(a: ExprInput): FuncGen<WasmVal> {
    return makeConvert("f32_convert_i32_s")(a);
  },

  // --- All conversions namespace ---
  convert: Object.fromEntries(
    ([
      "i32_wrap_i64",
      "i32_trunc_f32_s", "i32_trunc_f32_u", "i32_trunc_f64_s", "i32_trunc_f64_u",
      "i64_extend_i32_s", "i64_extend_i32_u",
      "i64_trunc_f32_s", "i64_trunc_f32_u", "i64_trunc_f64_s", "i64_trunc_f64_u",
      "f32_convert_i32_s", "f32_convert_i32_u", "f32_convert_i64_s", "f32_convert_i64_u",
      "f32_demote_f64",
      "f64_convert_i32_s", "f64_convert_i32_u", "f64_convert_i64_s", "f64_convert_i64_u",
      "f64_promote_f32",
      "i32_reinterpret_f32", "i64_reinterpret_f64", "f32_reinterpret_i32", "f64_reinterpret_i64",
    ] as ConvertKind[]).map(k => [k, makeConvert(k)])
  ) as Record<ConvertKind, (a: ExprInput) => FuncGen<WasmVal>>,
};

/** Memory and constant operations. */
export const Mem = {
  load(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32(va._node));
      })(),
    );
  },
  store(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
    })();
  },
  load8(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32_8u(va._node));
      })(),
    );
  },
  store8(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32_8(va._node, vv._node) };
    })();
  },
  i32(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i32(v));
      })(),
    );
  },
  i64(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i64(v));
      })(),
    );
  },
  f32(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_f32(v));
      })(),
    );
  },
  f64(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_f64(v));
      })(),
    );
  },
  // --- i64 memory ---
  loadI64(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i64(va._node));
      })(),
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
  loadF32(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("f32_load", va._node));
      })(),
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
  loadF64(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_f64(va._node));
      })(),
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
  loadI64_8s(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load8_s", va._node));
      })(),
    );
  },
  loadI64_8u(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load8_u", va._node));
      })(),
    );
  },
  loadI64_16s(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load16_s", va._node));
      })(),
    );
  },
  loadI64_16u(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load16_u", va._node));
      })(),
    );
  },
  loadI64_32s(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load32_s", va._node));
      })(),
    );
  },
  loadI64_32u(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.mem_load("i64_load32_u", va._node));
      })(),
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
  // --- Memory misc ---
  size(): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.memory_size());
    })();
  },
  grow(pages: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const vp = yield* resolve(pages);
      return val(IR.memory_grow(vp._node));
    })();
  },
  // --- Array helpers ---
  i32Array(base: number = 0): {
    load(idx: ExprInput): ChainableExpr;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
    swap(i: ExprInput, j: ExprInput, tmp: WasmRef): FuncGen<void>;
  } {
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 4));
      return base === 0 ? scaled : scaled.add(base);
    };
    const arr = {
      load: (idx: ExprInput): ChainableExpr => Mem.load(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput): FuncGen<void> =>
        Mem.store(addrOf(idx), value),
      swap: (i: ExprInput, j: ExprInput, tmp: WasmRef): FuncGen<void> =>
        (function* () {
          yield* set(tmp, arr.load(i));
          yield* arr.store(i, arr.load(j));
          yield* arr.store(j, tmp);
        })(),
    };
    return arr;
  },
  i32Array2D(base: number = 0, cols: ExprInput): {
    load(row: ExprInput, col: ExprInput): ChainableExpr;
    store(row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const flatIdx = (row: ExprInput, col: ExprInput): ChainableExpr =>
      new ChainableExpr(add(mul(row, cols), col));
    const addrOf = (row: ExprInput, col: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(flatIdx(row, col), 4));
      return base === 0 ? scaled : scaled.add(base);
    };
    return {
      load: (row: ExprInput, col: ExprInput): ChainableExpr =>
        Mem.load(addrOf(row, col)),
      store: (row: ExprInput, col: ExprInput, value: ExprInput): FuncGen<void> =>
        Mem.store(addrOf(row, col), value),
    };
  },
};

/** Control flow: branching, loops, blocks. */
export const Ctrl = {
  if(cond: ExprInput): IfBuilder {
    return new IfBuilder(cond);
  },
  loop(body: VoidBody): FuncGen<void> {
    return (function* () {
      yield { _type: "loop", body: toBody(body) };
    })();
  },
  block(body: VoidBody): FuncGen<void> {
    return (function* () {
      yield { _type: "block", body: toBody(body) };
    })();
  },
  br(depth: number): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.br(depth) };
    })();
  },
  br_if(depth: number, cond: ExprInput): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
    })();
  },
  br_table(expr: ExprInput, labels: number[], default_: number): FuncGen<void> {
    return (function* () {
      const ve = yield* resolve(expr);
      yield { _type: "stmt", node: IR.br_table(labels, default_, ve._node) };
    })();
  },
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
  switch(
    expr: ExprInput,
    cases: [number, VoidBody][],
    default_?: VoidBody,
  ): FuncGen<void> {
    const normalizedDefault = default_ ? toBody(default_) : undefined;

    // Dense check: at least 3 cases with contiguous integer values
    if (cases.length >= 3) {
      const vals = cases.map(([v]) => v);
      const minVal = Math.min(...vals);
      const maxVal = Math.max(...vals);
      const isDense = maxVal - minVal + 1 === cases.length && new Set(vals).size === cases.length;

      if (isDense) {
        const sorted = cases
          .map(([v, b]) => ({ v, b: toBody(b) }))
          .sort((a, b) => a.v - b.v);
        const n = sorted.length;
        const hasDefault = normalizedDefault != null;

        // Structure (outside-in):
        //   block $exit
        //     [block $default]        // only if hasDefault
        //       block B0 (outermost case block)
        //         block B1
        //           ...
        //             block B_{n-1} (innermost)
        //               br_table
        //             end             // sorted[n-1] body here
        //             br $exit
        //           end               // sorted[n-2] body here
        //           br $exit
        //         ...
        //       end                   // sorted[0] body here
        //       br $exit
        //     [end]                   // default body here
        //   end
        //
        // From br_table: depth 0 = B_{n-1}, depth k = B_{n-1-k}
        // To reach sorted[v] body: br to B_{n-1-v} → depth = n-1-v

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
                    yield* sorted[depth]!.b();
                    yield { _type: "stmt" as const, node: IR.br(depth + (hasDefault ? 1 : 0)) };
                  };
                };
                yield* buildBlocks(0)();
              };

              if (hasDefault) {
                yield {
                  _type: "block" as const,
                  body: function* () { yield* emitCases(); },
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
        const [value, body] = cases[i]!;
        const nb = toBody(body);
        const rest = buildChain(i + 1);
        return function* () {
          const ve = yield* resolve(expr);
          const vc = yield* resolve(eq(ve, value));
          yield {
            _type: "if" as const,
            cond: vc._node,
            then_: nb,
            else_: rest,
          };
        };
      };
      const chain = buildChain(0);
      if (chain) yield* chain();
    })();
  },
  nop(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.nop() };
    })();
  },
  effect(tag: number, payload: ExprInput): FuncGen<void> {
    return (function* () {
      const vp = yield* resolve(payload);
      yield { _type: "stmt", node: IR.effect(tag, vp._node) };
    })();
  },
  unreachable(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.unreachable() };
    })();
  },
};

/** Local variable operations. */
export const Loc = {
  get(r: WasmRef): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.local_get(r._idx));
    })();
  },
  set,
  tee,
  drop(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.drop(v._node) };
    })();
  },
  return(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.return_(v._node) };
    })();
  },
};
