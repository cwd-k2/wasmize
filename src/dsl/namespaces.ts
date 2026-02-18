import { IR } from "../wasm/ir";
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
  /**
   * Defines a new function in the module.
   *
   * @example
   * ```ts
   * // Traditional body
   * const f = yield* Mod.func(function* () { ... });
   * // Inline params
   * const f = yield* Mod.func({ a: Type.i32, b: Type.i32 }, function* (a, b) { ... });
   * ```
   */
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
  /** Exports a function under the given name. */
  export(name: string, funcref: FuncRef): ModuleGen<void> {
    return (function* () {
      yield { _type: "export", name, ref: funcref } as ModuleInstruction;
    })();
  },
  /** Declares an imported function from a host module. */
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
  /**
   * Exports multiple functions at once.
   *
   * @example
   * ```ts
   * yield* Mod.exportAll({ init, find, union, count });
   * ```
   */
  exportAll(funcs: Record<string, FuncRef>): ModuleGen<void> {
    return (function* () {
      for (const [name, ref] of Object.entries(funcs)) {
        yield { _type: "export", name, ref } as ModuleInstruction;
      }
    })();
  },
  /**
   * Defines and exports a function in one step.
   *
   * @example
   * ```ts
   * const f = yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
   *   return yield* a.add(b);
   * });
   * ```
   */
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
  /**
   * Defines a self-recursive function. The `self` reference is passed to the body.
   *
   * @example
   * ```ts
   * const fib = yield* Mod.recursive({ n: Type.i32 }, function* (self, n) {
   *   return yield* Ctrl.if(n.le(1))
   *     .then(function* () { return yield* n; })
   *     .else(function* () { return yield* self(n.sub(1)).add(self(n.sub(2))); });
   * });
   * ```
   */
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
          // Params form
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
  /** Declares linear memory with the given initial size. */
  memory(pages: number): ModuleGen<void> {
    return (function* () {
      yield { _type: "memory", pages } as ModuleInstruction;
    })();
  },
};

/** Arithmetic, comparison, and bitwise operations. */
export const Op = {
  /** Integer addition (`i32.add`). */
  add,
  /** Integer subtraction (`i32.sub`). */
  sub,
  /** Integer multiplication (`i32.mul`). */
  mul,
  /** Integer division — signed (`i32.div_s`). */
  div,
  /** Integer remainder — signed (`i32.rem_s`). */
  rem,
  /** Equal (`i32.eq`). */
  eq,
  /** Not equal (`i32.ne`). */
  ne,
  /** Less than — signed (`i32.lt_s`). */
  lt,
  /** Greater than — signed (`i32.gt_s`). */
  gt,
  /** Less than or equal — signed (`i32.le_s`). */
  le,
  /** Greater than or equal — signed (`i32.ge_s`). */
  ge,
  /** Bitwise AND (`i32.and`). */
  and: and_,
  /** Bitwise OR (`i32.or`). */
  or: or_,
  /** Bitwise XOR (`i32.xor`). */
  xor: xor_,
  /** Bitwise shift left (`i32.shl`). */
  shl,
  /** Bitwise shift right — signed (`i32.shr_s`). */
  shr,
  /** Ternary select — `cond ? ifTrue : ifFalse` (Wasm `select` instruction, branchless). */
  select: select_,
  /** Returns the greater of two values (`select`-based, branchless). */
  max(a: ExprInput, b: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(a);
        const vb = yield* resolve(b);
        return val(IR.select(va._node, vb._node, IR.cmp("gt", va._node, vb._node)));
      })(),
    );
  },
  /** Returns the lesser of two values (`select`-based, branchless). */
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

  // --- i64 operations ---
  i64: {
    add: makeBinopTyped("add", "i64"),
    sub: makeBinopTyped("sub", "i64"),
    mul: makeBinopTyped("mul", "i64"),
    div: makeBinopTyped("div", "i64"),
    eqz(a: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        const va = yield* resolve(a);
        return val(IR.eqz(va._node, "i64"));
      })();
    },
  },

  // --- f64 operations ---
  f64: {
    add: makeBinopTyped("add", "f64"),
    sub: makeBinopTyped("sub", "f64"),
    mul: makeBinopTyped("mul", "f64"),
    div: makeBinopTyped("div", "f64"),
    neg(a: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        const va = yield* resolve(a);
        return val(IR.f64_neg(va._node));
      })();
    },
    abs(a: ExprInput): FuncGen<WasmVal> {
      return (function* () {
        const va = yield* resolve(a);
        return val(IR.f64_abs(va._node));
      })();
    },
  },

  // --- Conversions ---
  /** i64 → i32 (`i32.wrap_i64`). */
  wrap(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_wrap_i64(va._node));
    })();
  },
  /** i32 → i64 (`i64.extend_i32_s`). */
  extend(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i64_extend_i32_s(va._node));
    })();
  },
  /** i32 → f64 (`f64.convert_i32_s`). */
  toF64(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.f64_convert_i32_s(va._node));
    })();
  },
  /** f64 → i32 (`i32.trunc_f64_s`). */
  truncI32(a: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const va = yield* resolve(a);
      return val(IR.i32_trunc_f64_s(va._node));
    })();
  },
};

/** Memory and constant operations. */
export const Mem = {
  /** Loads a 32-bit integer from linear memory. Returns {@link ChainableExpr} for chaining. */
  load(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32(va._node));
      })(),
    );
  },
  /** Stores a 32-bit integer to linear memory. */
  store(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
    })();
  },
  /** Loads a byte (unsigned) from linear memory. Returns {@link ChainableExpr} for chaining. */
  load8(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32_8u(va._node));
      })(),
    );
  },
  /** Stores a byte to linear memory. */
  store8(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32_8(va._node, vv._node) };
    })();
  },
  /** Creates an i32 constant value. Returns {@link ChainableExpr} for chaining. */
  i32(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i32(v));
      })(),
    );
  },
  /** Creates an i64 constant value. Returns {@link ChainableExpr} for chaining. */
  i64(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i64(v));
      })(),
    );
  },
  /** Creates an f64 constant value. Returns {@link ChainableExpr} for chaining. */
  f64(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_f64(v));
      })(),
    );
  },
  /** Loads a 64-bit integer from linear memory. */
  loadI64(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i64(va._node));
      })(),
    );
  },
  /** Stores a 64-bit integer to linear memory. */
  storeI64(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i64(va._node, vv._node) };
    })();
  },
  /** Loads a 64-bit float from linear memory. */
  loadF64(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_f64(va._node));
      })(),
    );
  },
  /** Stores a 64-bit float to linear memory. */
  storeF64(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_f64(va._node, vv._node) };
    })();
  },
  /** Returns current memory size in pages. */
  size(): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.memory_size());
    })();
  },
  /** Grows linear memory by the given number of pages. Returns previous size or -1 on failure. */
  grow(pages: ExprInput): FuncGen<WasmVal> {
    return (function* () {
      const vp = yield* resolve(pages);
      return val(IR.memory_grow(vp._node));
    })();
  },
  /**
   * Creates a typed i32 array accessor for linear memory.
   * Automatically applies `idx * 4 + base` address calculation.
   *
   * @param base - Byte offset where the array starts (default: 0)
   * @returns Object with `load(idx)`, `store(idx, val)`, and `swap(i, j, tmp)` methods
   */
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
  /**
   * Creates a 2D typed i32 array accessor for linear memory.
   * Address calculation: `(row * cols + col) * 4 + base`.
   *
   * @param base - Byte offset where the 2D array starts (default: 0)
   * @param cols - Number of columns (can be a runtime expression)
   * @returns Object with `load(row, col)` and `store(row, col, val)` methods
   */
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
  /**
   * Conditional execution — returns an IfBuilder for `.then()` / `.else()` chaining.
   *
   * @example
   * ```ts
   * yield* Ctrl.if(n.le(1))
   *   .then(function* () { return yield* Mem.load(n.mul(4)); })
   *   .else(function* () { ... });
   * ```
   */
  if(cond: ExprInput): IfBuilder {
    return new IfBuilder(cond);
  },
  /** Wasm `loop` block. Accepts array notation: `() => [a(), b()]`. */
  loop(body: VoidBody): FuncGen<void> {
    return (function* () {
      yield { _type: "loop", body: toBody(body) };
    })();
  },
  /** Wasm `block`. Accepts array notation: `() => [a(), b()]`. */
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
  /** Conditional branch — branches if the condition is non-zero. */
  br_if(depth: number, cond: ExprInput): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
    })();
  },
  /**
   * While loop — continues while `cond` is true.
   * Expands to `block { loop { br_if(1, eqz(cond)); body; br(0); } }`.
   */
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
   * For loop — `variable = start; while (cond) { body; variable = step; }`.
   * `step` is evaluated as an expression each iteration (e.g. `i.add(1)`).
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
  /** Void-only conditional — `if (cond) { body }`. Shortcut for `.then()` without `.else()`. Accepts array notation. */
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
   * Multi-way branch (switch/case) — expands to nested if/else.
   *
   * @param expr - The expression to match against
   * @param cases - Array of `[value, body]` pairs
   * @param default_ - Optional default body when no case matches
   *
   * @example
   * ```ts
   * yield* Ctrl.switch(direction, [
   *   [0, function* () { yield* nx.set(cx.add(1)); }],
   *   [1, function* () { yield* nx.set(cx.sub(1)); }],
   * ], function* () { yield* Ctrl.nop(); });
   * ```
   */
  switch(
    expr: ExprInput,
    cases: [number, VoidBody][],
    default_?: VoidBody,
  ): FuncGen<void> {
    const normalizedDefault = default_ ? toBody(default_) : undefined;
    return (function* () {
      // Build nested if/else from the last case backward
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
  /** Emits a no-op instruction. */
  nop(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.nop() };
    })();
  },
  /** Emits a side-effect instruction. */
  effect(tag: number, payload: ExprInput): FuncGen<void> {
    return (function* () {
      const vp = yield* resolve(payload);
      yield { _type: "stmt", node: IR.effect(tag, vp._node) };
    })();
  },
  /** Emits an unreachable trap instruction. */
  unreachable(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.unreachable() };
    })();
  },
};

/** Local variable operations. */
export const Loc = {
  /** Reads the current value of a local variable or parameter. */
  get(r: WasmRef): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.local_get(r._idx));
    })();
  },
  /** Sets a local variable to a new value. */
  set,
  /** Sets a local variable and returns the value (tee). */
  tee,
  /** Evaluates an expression and discards its value. */
  drop(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.drop(v._node) };
    })();
  },
  /** Returns a value from the current function. */
  return(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.return_(v._node) };
    })();
  },
};
