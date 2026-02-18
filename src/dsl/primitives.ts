import { IR, type BinopKind, type CmpKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  WasmRef,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type ModuleGen,
  type FuncInstruction,
  type ModuleInstruction,
} from "./types";

// --- ExprInput + ChainableExpr ---

/**
 * Extended expression type accepted by all DSL primitives.
 * Includes everything in {@link Expr} plus {@link ChainableExpr} and {@link ThenBuilder}.
 */
export type ExprInput = Expr | ChainableExpr | ThenBuilder;

/**
 * A callable function reference. Invoke directly for value-returning calls,
 * or use `.void()` for statement (void) calls.
 *
 * @example
 * ```ts
 * yield* Loc.set(result, myFunc(a, b));     // value call
 * yield* myFunc.void(a, b);                 // void call
 * yield* Mod.export("myFunc", myFunc);      // export (FuncRef-compatible)
 * ```
 */
export interface CallableFunc {
  (...args: ExprInput[]): FuncGen<WasmVal>;
  void(...args: ExprInput[]): FuncGen<void>;
  readonly _tag: "func";
  readonly _idx: number;
}

/**
 * Wraps an {@link Expr} and provides chainable arithmetic, comparison,
 * bitwise, and memory operations.
 *
 * Implements `[Symbol.iterator]()` so `yield* chainableExpr` works
 * in generator-based DSL code.
 *
 * @example
 * ```ts
 * Mem.load(i.sub(1).mul(4))  // load from address (i-1)*4
 * ```
 */
export class ChainableExpr {
  constructor(private readonly _inner: Expr) {}

  [Symbol.iterator](): Generator<FuncInstruction, WasmVal, any> {
    return resolve(this._inner);
  }

  // --- Arithmetic ---
  /** Returns a new expression: `this + b` (`i32.add`). */
  add(b: ExprInput): ChainableExpr {
    return new ChainableExpr(add(this._inner, b));
  }
  /** Returns a new expression: `this - b` (`i32.sub`). */
  sub(b: ExprInput): ChainableExpr {
    return new ChainableExpr(sub(this._inner, b));
  }
  /** Returns a new expression: `this * b` (`i32.mul`). */
  mul(b: ExprInput): ChainableExpr {
    return new ChainableExpr(mul(this._inner, b));
  }
  /** Returns a new expression: `this / b` (`i32.div_s`). */
  div(b: ExprInput): ChainableExpr {
    return new ChainableExpr(div(this._inner, b));
  }
  /** Returns a new expression: `this % b` (`i32.rem_s`). */
  rem(b: ExprInput): ChainableExpr {
    return new ChainableExpr(rem(this._inner, b));
  }

  // --- Comparison ---
  /** Returns a new expression: `this == b` (`i32.eq`). */
  eq(b: ExprInput): ChainableExpr {
    return new ChainableExpr(eq(this._inner, b));
  }
  /** Returns a new expression: `this != b` (`i32.ne`). */
  ne(b: ExprInput): ChainableExpr {
    return new ChainableExpr(ne(this._inner, b));
  }
  /** Returns a new expression: `this < b` (`i32.lt_s`). */
  lt(b: ExprInput): ChainableExpr {
    return new ChainableExpr(lt(this._inner, b));
  }
  /** Returns a new expression: `this > b` (`i32.gt_s`). */
  gt(b: ExprInput): ChainableExpr {
    return new ChainableExpr(gt(this._inner, b));
  }
  /** Returns a new expression: `this <= b` (`i32.le_s`). */
  le(b: ExprInput): ChainableExpr {
    return new ChainableExpr(le(this._inner, b));
  }
  /** Returns a new expression: `this >= b` (`i32.ge_s`). */
  ge(b: ExprInput): ChainableExpr {
    return new ChainableExpr(ge(this._inner, b));
  }

  // --- Bitwise ---
  /** Returns a new expression: `this & b` (`i32.and`). */
  and(b: ExprInput): ChainableExpr {
    return new ChainableExpr(and_(this._inner, b));
  }
  /** Returns a new expression: `this | b` (`i32.or`). */
  or(b: ExprInput): ChainableExpr {
    return new ChainableExpr(or_(this._inner, b));
  }
  /** Returns a new expression: `this ^ b` (`i32.xor`). */
  xor(b: ExprInput): ChainableExpr {
    return new ChainableExpr(xor_(this._inner, b));
  }
  /** Returns a new expression: `this << b` (`i32.shl`). */
  shl(b: ExprInput): ChainableExpr {
    return new ChainableExpr(shl(this._inner, b));
  }
  /** Returns a new expression: `this >> b` (`i32.shr_s`). */
  shr(b: ExprInput): ChainableExpr {
    return new ChainableExpr(shr(this._inner, b));
  }
}

// --- resolve helper ---

/**
 * Resolves an {@link ExprInput} to a concrete {@link WasmVal}.
 *
 * - `number` → `i32.const`
 * - `ChainableExpr` → delegated via `yield*`
 * - `WasmRef` → `local_get`
 * - `WasmVal` → returned as-is
 * - `FuncGen<WasmVal>` → driven via `yield*`
 */
function* resolve(
  expr: ExprInput,
): Generator<FuncInstruction, WasmVal, any> {
  if (typeof expr === "number") return val(IR.const_i32(expr));
  if (expr instanceof ChainableExpr) return yield* expr;
  if (expr instanceof ThenBuilder) return yield* expr;
  if (expr instanceof WasmRef) return val(IR.local_get(expr._idx));
  if ("_tag" in expr && expr._tag === "val") return expr as WasmVal;
  return yield* (expr as FuncGen<WasmVal>);
}

// --- CallableFunc factory ---

function callableFunc(idx: number): CallableFunc {
  const ref: FuncRef = { _tag: "func", _idx: idx };
  return Object.assign(
    (...args: ExprInput[]): FuncGen<WasmVal> => call(ref, ...args),
    {
      _tag: "func" as const,
      _idx: idx,
      void: (...args: ExprInput[]): FuncGen<void> => call_(ref, ...args),
    },
  );
}

// --- Expression primitives (module-private) ---

function makeBinop(kind: BinopKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node));
    })();
}

const add = makeBinop("add");
const sub = makeBinop("sub");
const mul = makeBinop("mul");
const div = makeBinop("div");
const rem = makeBinop("rem");
const and_ = makeBinop("and");
const or_ = makeBinop("or");
const xor_ = makeBinop("xor");
const shl = makeBinop("shl");
const shr = makeBinop("shr");

function makeCmp(kind: CmpKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node));
    })();
}

const eq = makeCmp("eq");
const ne = makeCmp("ne");
const lt = makeCmp("lt");
const gt = makeCmp("gt");
const le = makeCmp("le");
const ge = makeCmp("ge");

// --- Statement primitives (module-private) ---

function set(r: WasmRef, value: ExprInput): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_set(r._idx, v._node) };
  })();
}

function tee(r: WasmRef, value: ExprInput): FuncGen<WasmVal> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_tee(r._idx, v._node) };
    return val(IR.local_get(r._idx));
  })();
}

function call(
  funcref: FuncRef,
  ...args: ExprInput[]
): FuncGen<WasmVal> {
  return (function* () {
    const resolved = [];
    for (const a of args) {
      resolved.push(yield* resolve(a));
    }
    return val(IR.call(funcref._idx, resolved.map((r) => r._node)));
  })();
}

function call_(funcref: FuncRef, ...args: ExprInput[]): FuncGen<void> {
  return (function* () {
    const resolved = [];
    for (const a of args) {
      resolved.push(yield* resolve(a));
    }
    yield {
      _type: "stmt",
      node: IR.call(funcref._idx, resolved.map((r) => r._node)),
    };
  })();
}

// --- Control flow primitives ---

function if_impl(
  cond: ExprInput,
  then_: FuncBody<WasmVal | void>,
  else_?: FuncBody<WasmVal | void>,
): FuncGen<any> {
  return (function* () {
    const vc = yield* resolve(cond);
    const result: WasmVal | void = yield {
      _type: "if",
      cond: vc._node,
      then_,
      else_,
    };
    return result;
  })();
}

class IfBuilder {
  constructor(private readonly _cond: ExprInput) {}
  /** Specifies the then-branch body. Returns a {@link ThenBuilder} for optional `.else()` chaining. */
  then(body: FuncBody<WasmVal | void>): ThenBuilder {
    return new ThenBuilder(this._cond, body);
  }
}

/**
 * Builder for conditional execution with `.then()` / `.else()` chaining.
 * Use `yield*` to execute the conditional.
 */
export class ThenBuilder {
  constructor(
    private readonly _cond: ExprInput,
    private readonly _then: FuncBody<WasmVal | void>,
    private readonly _else?: FuncBody<WasmVal | void>,
  ) {}

  /** Specifies the else-branch body. Returns a new ThenBuilder (immutable chaining). */
  else(body: FuncBody<WasmVal | void>): ThenBuilder {
    return new ThenBuilder(this._cond, this._then, body);
  }

  [Symbol.iterator](): Generator<FuncInstruction, any, any> {
    return if_impl(this._cond, this._then, this._else);
  }
}

// --- Declaration primitives ---

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

// --- Type constants ---

/** Wasm value type constants for use with `param()` and `local()`. */
export const Type = { i32: "i32", i64: "i64", f64: "f64" } as const;

// --- Namespace objects ---

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

// --- WasmRef method augmentation ---

declare module "./types" {
  interface WasmRef {
    /** Sets this variable to a new value. */
    set(value: ExprInput): FuncGen<void>;
    /** Sets this variable and returns the value (tee). Returns {@link ChainableExpr} for chaining. */
    tee(value: ExprInput): ChainableExpr;
    /** Returns a new expression: `this + b` (`i32.add`). */
    add(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this - b` (`i32.sub`). */
    sub(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this * b` (`i32.mul`). */
    mul(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this / b` (`i32.div_s`). */
    div(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this % b` (`i32.rem_s`). */
    rem(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this == b` (`i32.eq`). */
    eq(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this != b` (`i32.ne`). */
    ne(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this < b` (`i32.lt_s`). */
    lt(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this > b` (`i32.gt_s`). */
    gt(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this <= b` (`i32.le_s`). */
    le(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this >= b` (`i32.ge_s`). */
    ge(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this & b` (`i32.and`). */
    and(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this | b` (`i32.or`). */
    or(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this ^ b` (`i32.xor`). */
    xor(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this << b` (`i32.shl`). */
    shl(b: ExprInput): ChainableExpr;
    /** Returns a new expression: `this >> b` (`i32.shr_s`). */
    shr(b: ExprInput): ChainableExpr;
  }
}

// set & tee
WasmRef.prototype.set = function (this: WasmRef, value: ExprInput): FuncGen<void> {
  return set(this, value);
};
WasmRef.prototype.tee = function (this: WasmRef, value: ExprInput): ChainableExpr {
  return new ChainableExpr(tee(this, value));
};

// Arithmetic
WasmRef.prototype.add = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(add(this, b));
};
WasmRef.prototype.sub = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(sub(this, b));
};
WasmRef.prototype.mul = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(mul(this, b));
};
WasmRef.prototype.div = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(div(this, b));
};
WasmRef.prototype.rem = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(rem(this, b));
};

// Comparison
WasmRef.prototype.eq = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(eq(this, b));
};
WasmRef.prototype.ne = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(ne(this, b));
};
WasmRef.prototype.lt = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(lt(this, b));
};
WasmRef.prototype.gt = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(gt(this, b));
};
WasmRef.prototype.le = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(le(this, b));
};
WasmRef.prototype.ge = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(ge(this, b));
};

// Bitwise
WasmRef.prototype.and = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(and_(this, b));
};
WasmRef.prototype.or = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(or_(this, b));
};
WasmRef.prototype.xor = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(xor_(this, b));
};
WasmRef.prototype.shl = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(shl(this, b));
};
WasmRef.prototype.shr = function (this: WasmRef, b: ExprInput): ChainableExpr {
  return new ChainableExpr(shr(this, b));
};
