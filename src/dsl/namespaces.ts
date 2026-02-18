import { IR } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  WasmRef,
  type FuncRef,
  type FuncGen,
  type FuncBody,
  type ModuleGen,
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
} from "./expr";

/** Module-level declarations: functions, exports, imports, memory. */
export const Mod = {
  /** Defines a new function in the module. */
  func(body: FuncBody<WasmVal | void>): ModuleGen<CallableFunc> {
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
} as const;

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
  /** Wasm `loop` block. */
  loop(body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      yield { _type: "loop", body };
    })();
  },
  /** Wasm `block`. */
  block(body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      yield { _type: "block", body };
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
  while(cond: ExprInput, body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      yield {
        _type: "block" as const,
        body: function* () {
          yield {
            _type: "loop" as const,
            body: function* () {
              const vc = yield* resolve(cond);
              yield { _type: "stmt" as const, node: IR.br_if(1, IR.eqz(vc._node)) };
              yield* body();
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
    body: FuncBody<void>,
  ): FuncGen<void> {
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
              yield* body();
              yield* set(variable, step);
              yield { _type: "stmt" as const, node: IR.br(0) };
            },
          };
        },
      };
    })();
  },
  /** Void-only conditional — `if (cond) { body }`. Shortcut for `.then()` without `.else()`. */
  when(cond: ExprInput, body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield {
        _type: "if" as const,
        cond: vc._node,
        then_: body,
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
    cases: [number, FuncBody<void>][],
    default_?: FuncBody<void>,
  ): FuncGen<void> {
    return (function* () {
      // Build nested if/else from the last case backward
      const buildChain = (i: number): FuncBody<void> | undefined => {
        if (i >= cases.length) return default_;
        const [value, body] = cases[i]!;
        const rest = buildChain(i + 1);
        return function* () {
          const ve = yield* resolve(expr);
          const vc = yield* resolve(eq(ve, value));
          yield {
            _type: "if" as const,
            cond: vc._node,
            then_: body,
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
