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
 * Wraps an {@link Expr} and provides chainable arithmetic, comparison,
 * bitwise, and memory operations.
 *
 * Implements `[Symbol.iterator]()` so `yield* chainableExpr` works
 * in generator-based DSL code.
 *
 * @example
 * ```ts
 * mem.load(i.sub(1).mul(4))  // load from address (i-1)*4
 * ```
 */
export class ChainableExpr {
  constructor(private readonly _inner: Expr) {}

  [Symbol.iterator](): Generator<FuncInstruction, WasmVal, any> {
    return resolve(this._inner);
  }

  // --- Arithmetic ---
  add(b: ExprInput): ChainableExpr {
    return new ChainableExpr(add(this._inner, b));
  }
  sub(b: ExprInput): ChainableExpr {
    return new ChainableExpr(sub(this._inner, b));
  }
  mul(b: ExprInput): ChainableExpr {
    return new ChainableExpr(mul(this._inner, b));
  }
  div(b: ExprInput): ChainableExpr {
    return new ChainableExpr(div(this._inner, b));
  }
  rem(b: ExprInput): ChainableExpr {
    return new ChainableExpr(rem(this._inner, b));
  }

  // --- Comparison ---
  eq(b: ExprInput): ChainableExpr {
    return new ChainableExpr(eq(this._inner, b));
  }
  ne(b: ExprInput): ChainableExpr {
    return new ChainableExpr(ne(this._inner, b));
  }
  lt(b: ExprInput): ChainableExpr {
    return new ChainableExpr(lt(this._inner, b));
  }
  gt(b: ExprInput): ChainableExpr {
    return new ChainableExpr(gt(this._inner, b));
  }
  le(b: ExprInput): ChainableExpr {
    return new ChainableExpr(le(this._inner, b));
  }
  ge(b: ExprInput): ChainableExpr {
    return new ChainableExpr(ge(this._inner, b));
  }

  // --- Bitwise ---
  and(b: ExprInput): ChainableExpr {
    return new ChainableExpr(and_(this._inner, b));
  }
  or(b: ExprInput): ChainableExpr {
    return new ChainableExpr(or_(this._inner, b));
  }
  xor(b: ExprInput): ChainableExpr {
    return new ChainableExpr(xor_(this._inner, b));
  }
  shl(b: ExprInput): ChainableExpr {
    return new ChainableExpr(shl(this._inner, b));
  }
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
export function* resolve(
  expr: ExprInput,
): Generator<FuncInstruction, WasmVal, any> {
  if (typeof expr === "number") return val(IR.const_i32(expr));
  if (expr instanceof ChainableExpr) return yield* expr;
  if (expr instanceof ThenBuilder) return yield* expr;
  if (expr instanceof WasmRef) return val(IR.local_get(expr._idx));
  if ("_tag" in expr && expr._tag === "val") return expr as WasmVal;
  return yield* (expr as FuncGen<WasmVal>);
}

// --- Module-level primitives ---

/**
 * Declares an imported function from a host module.
 */
export function import_(
  mod: string,
  name: string,
  params: WasmValType[],
  results: WasmValType[],
): ModuleGen<FuncRef> {
  return (function* () {
    const r: FuncRef = yield {
      _type: "import_func",
      module: mod,
      name,
      params,
      results,
    };
    return r;
  })();
}

/**
 * Defines a new function in the module.
 */
export function func(
  body: FuncBody<WasmVal | void>,
): ModuleGen<FuncRef> {
  return (function* () {
    const r: FuncRef = yield { _type: "func", body };
    return r;
  })();
}

/**
 * Exports a function under the given name.
 */
export function export_(
  name: string,
  funcref: FuncRef,
): ModuleGen<void> {
  return (function* () {
    yield { _type: "export", name, ref: funcref } as ModuleInstruction;
  })();
}

/**
 * Declares linear memory with the given initial size.
 */
export function memory(pages: number): ModuleGen<void> {
  return (function* () {
    yield { _type: "memory", pages } as ModuleInstruction;
  })();
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

// --- Expression primitives ---

/** Creates an i32 constant value. */
export function i32(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i32(v));
  })();
}

/** Creates an i64 constant value. */
export function i64(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i64(v));
  })();
}

/** Reads the current value of a local variable or parameter. */
export function get(r: WasmRef): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.local_get(r._idx));
  })();
}

function makeBinop(kind: BinopKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node));
    })();
}

/** Integer addition (`i32.add`). */
export const add = makeBinop("add");
/** Integer subtraction (`i32.sub`). */
export const sub = makeBinop("sub");
/** Integer multiplication (`i32.mul`). */
export const mul = makeBinop("mul");
/** Integer division — signed (`i32.div_s`). */
export const div = makeBinop("div");
/** Integer remainder — signed (`i32.rem_s`). */
export const rem = makeBinop("rem");
/** Bitwise AND (`i32.and`). */
export const and_ = makeBinop("and");
/** Bitwise OR (`i32.or`). */
export const or_ = makeBinop("or");
/** Bitwise XOR (`i32.xor`). */
export const xor_ = makeBinop("xor");
/** Bitwise shift left (`i32.shl`). */
export const shl = makeBinop("shl");
/** Bitwise shift right — signed (`i32.shr_s`). */
export const shr = makeBinop("shr");

function makeCmp(kind: CmpKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node));
    })();
}

/** Equal (`i32.eq`). */
export const eq = makeCmp("eq");
/** Not equal (`i32.ne`). */
export const ne = makeCmp("ne");
/** Less than — signed (`i32.lt_s`). */
export const lt = makeCmp("lt");
/** Greater than — signed (`i32.gt_s`). */
export const gt = makeCmp("gt");
/** Less than or equal — signed (`i32.le_s`). */
export const le = makeCmp("le");
/** Greater than or equal — signed (`i32.ge_s`). */
export const ge = makeCmp("ge");

/** Loads a 32-bit integer from linear memory. */
export function load(addr: ExprInput): FuncGen<WasmVal> {
  return (function* () {
    const va = yield* resolve(addr);
    return val(IR.load_i32(va._node));
  })();
}

/** Calls a function and returns its result. */
export function call(
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

// --- Statement primitives ---

/** Sets a local variable to a new value. */
export function set(r: WasmRef, value: ExprInput): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_set(r._idx, v._node) };
  })();
}

/** Sets a local variable and also returns the value (tee). */
export function tee(r: WasmRef, value: ExprInput): FuncGen<WasmVal> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_tee(r._idx, v._node) };
    return val(IR.local_get(r._idx));
  })();
}

/** Stores a 32-bit integer to linear memory. */
export function store(addr: ExprInput, value: ExprInput): FuncGen<void> {
  return (function* () {
    const va = yield* resolve(addr);
    const vv = yield* resolve(value);
    yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
  })();
}

/** Calls a function as a statement (discards return value). */
export function call_(funcref: FuncRef, ...args: ExprInput[]): FuncGen<void> {
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

/** Evaluates an expression and discards its value. */
export function drop_(value: ExprInput): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.drop(v._node) };
  })();
}

/** Returns a value from the current function. */
export function return_(value: ExprInput): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.return_(v._node) };
  })();
}

/** Unconditional branch to the enclosing block/loop at the given depth. */
export function br(depth: number): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.br(depth) };
  })();
}

/** Conditional branch — branches if the condition is non-zero. */
export function br_if(depth: number, cond: ExprInput): FuncGen<void> {
  return (function* () {
    const vc = yield* resolve(cond);
    yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
  })();
}

/** Emits a no-op instruction. */
export function nop_(): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.nop() };
  })();
}

/** Emits a side-effect instruction. */
export function effect(tag: number, payload: ExprInput): FuncGen<void> {
  return (function* () {
    const vp = yield* resolve(payload);
    yield { _type: "stmt", node: IR.effect(tag, vp._node) };
  })();
}

// --- Control flow primitives ---

/** Internal if_ implementation. */
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

  else(body: FuncBody<WasmVal | void>): ThenBuilder {
    return new ThenBuilder(this._cond, this._then, body);
  }

  [Symbol.iterator](): Generator<FuncInstruction, any, any> {
    return if_impl(this._cond, this._then, this._else);
  }
}

/**
 * Conditional execution — returns an {@link IfBuilder} for `.then()` / `.else()` chaining.
 *
 * @example
 * ```ts
 * yield* if_(n.le(1))
 *   .then(function* () { return yield* mem.load(n.mul(4)); })
 *   .else(function* () { ... });
 * ```
 */
export function if_(cond: ExprInput): IfBuilder {
  return new IfBuilder(cond);
}

/** Wasm `loop` block. */
export function loop_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "loop", body };
  })();
}

/** Wasm `block`. */
export function block_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "block", body };
  })();
}

// --- Namespace objects ---

/** Arithmetic, comparison, and bitwise operations. */
export const op = {
  add, sub, mul, div, rem,
  eq, ne, lt, gt, le, ge,
  and: and_, or: or_, xor: xor_, shl, shr,
} as const;

/** Memory and constant operations. `load`, `i32`, `i64` return ChainableExpr for post-op chaining. */
export const mem = {
  load: (addr: ExprInput): ChainableExpr => new ChainableExpr(load(addr)),
  store,
  i32: (v: number): ChainableExpr => new ChainableExpr(i32(v)),
  i64: (v: number): ChainableExpr => new ChainableExpr(i64(v)),
};

/** Control flow: branching, loops, blocks, calls. */
export const ctrl = {
  if: if_, loop: loop_, block: block_,
  br, br_if,
  call, call_,
  nop: nop_, effect,
} as const;

/** Local variable operations. */
export const loc = {
  get, set, tee,
  drop: drop_, return: return_,
} as const;

// --- WasmRef method augmentation ---

declare module "./types" {
  interface WasmRef {
    set(value: ExprInput): FuncGen<void>;
    tee(value: ExprInput): ChainableExpr;
    add(b: ExprInput): ChainableExpr;
    sub(b: ExprInput): ChainableExpr;
    mul(b: ExprInput): ChainableExpr;
    div(b: ExprInput): ChainableExpr;
    rem(b: ExprInput): ChainableExpr;
    eq(b: ExprInput): ChainableExpr;
    ne(b: ExprInput): ChainableExpr;
    lt(b: ExprInput): ChainableExpr;
    gt(b: ExprInput): ChainableExpr;
    le(b: ExprInput): ChainableExpr;
    ge(b: ExprInput): ChainableExpr;
    and(b: ExprInput): ChainableExpr;
    or(b: ExprInput): ChainableExpr;
    xor(b: ExprInput): ChainableExpr;
    shl(b: ExprInput): ChainableExpr;
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

