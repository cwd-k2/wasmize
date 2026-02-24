/**
 * Expression primitives and the `resolve()` hub.
 *
 * Provides the building blocks for the generator DSL's expression layer:
 * - {@link resolve} — universal resolver that converts any `ExprInput`
 *   (number, WasmRef, WasmVal, ChainableExpr, FuncGen) into a `WasmVal`.
 * - {@link ChainableExpr} — fluent wrapper enabling `a.add(b).mul(c)` chains
 *   that compose into a single IR tree via deferred generators.
 * - Binary/comparison/unary/conversion factory functions used by both
 *   the `Op` namespace and `WasmRef` prototype augmentation.
 * - {@link CallableFunc} — typed callable reference for function invocation.
 *
 * @module
 */
import { IR, type BinopKind, type CmpKind, type UnaryKind, type ConvertKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  WasmRef,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type FuncReturn,
  type FuncInstruction,
  type VoidStmt,
} from "./types";

// --- ExprInput + ChainableExpr ---

/**
 * Extended expression type accepted by all DSL primitives.
 * Includes everything in {@link Expr} plus {@link ChainableExpr} and {@link ThenBuilder}.
 */
export type ExprInput = Expr | ChainableExpr<WasmValType> | ThenBuilder;

/**
 * A callable function reference. Invoke directly for value-returning calls,
 * or use `.void()` for statement (void) calls.
 *
 * **Known TS limitation — `& ExprInput[]` intersection:**
 * `{ [K in keyof Params]: ExprInput }` is a deferred mapped type that TS
 * cannot prove is an array, so rest parameters reject it alone. The
 * `& ExprInput[]` intersection satisfies the rest-param constraint but
 * makes the overall type **invariant** in `Params`: a concrete
 * `CallableFunc<["i32","i32"]>` is NOT assignable to `CallableFunc<WasmValType[]>`.
 * Conditional types (`Params extends ... ? ... : never`) were evaluated but
 * TS defers them, making the call signature opaque (`never` effectively).
 *
 * @example
 * ```ts
 * yield* Loc.set(result, myFunc(a, b));     // value call
 * yield* myFunc.void(a, b);                 // void call
 * yield* Mod.export("myFunc", myFunc);       // export (FuncRef-compatible)
 * ```
 */
export interface CallableFunc<Params extends readonly WasmValType[] = WasmValType[]> {
  (...args: { [K in keyof Params]: ExprInput } & ExprInput[]): FuncGen<WasmVal>;
  void(...args: { [K in keyof Params]: ExprInput } & ExprInput[]): FuncGen<void>;
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
export class ChainableExpr<T extends WasmValType = "i32"> {
  constructor(
    private readonly _inner: Expr,
    readonly _type: T = "i32" as T,
  ) {}

  [Symbol.iterator](): Generator<FuncInstruction, WasmVal, any> {
    return resolve(this._inner);
  }

  // --- Arithmetic (preserve type) ---
  add(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("add", this._type)(this._inner, b), this._type);
  }
  sub(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("sub", this._type)(this._inner, b), this._type);
  }
  mul(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("mul", this._type)(this._inner, b), this._type);
  }
  div(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("div", this._type)(this._inner, b), this._type);
  }
  rem(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("rem", this._type)(this._inner, b), this._type);
  }

  // --- Comparison (always i32) ---
  eq(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("eq", this._type)(this._inner, b), "i32");
  }
  ne(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("ne", this._type)(this._inner, b), "i32");
  }
  lt(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("lt", this._type)(this._inner, b), "i32");
  }
  gt(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("gt", this._type)(this._inner, b), "i32");
  }
  le(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("le", this._type)(this._inner, b), "i32");
  }
  ge(b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(makeCmpTyped("ge", this._type)(this._inner, b), "i32");
  }

  // --- Bitwise (preserve type — TS constraints enforced at WasmRef level) ---
  and(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("and", this._type)(this._inner, b), this._type);
  }
  or(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("or", this._type)(this._inner, b), this._type);
  }
  xor(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("xor", this._type)(this._inner, b), this._type);
  }
  shl(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("shl", this._type)(this._inner, b), this._type);
  }
  shr(b: ExprInput): ChainableExpr<T> {
    return new ChainableExpr(makeBinopTyped("shr", this._type)(this._inner, b), this._type);
  }

  // --- Unary: float ops (permissive — TS constraints enforced at WasmRef level) ---

  /** Negates the value (`f32.neg` / `f64.neg`). Float types only at WasmRef level. */
  neg(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("neg", this._type)(this._inner), this._type);
  }
  /** Absolute value (`f32.abs` / `f64.abs`). */
  abs(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("abs", this._type)(this._inner), this._type);
  }
  /** Square root (`f32.sqrt` / `f64.sqrt`). */
  sqrt(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("sqrt", this._type)(this._inner), this._type);
  }
  /** Round toward positive infinity. */
  ceil(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("ceil", this._type)(this._inner), this._type);
  }
  /** Round toward negative infinity. */
  floor(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("floor", this._type)(this._inner), this._type);
  }
  /** Round toward zero. */
  trunc(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("trunc", this._type)(this._inner), this._type);
  }
  /** Round to nearest even. */
  nearest(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("nearest", this._type)(this._inner), this._type);
  }

  // --- Unary: int ops (permissive) ---

  /** Count leading zeros. Integer types only at WasmRef level. */
  clz(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("clz", this._type)(this._inner), this._type);
  }
  /** Count trailing zeros. */
  ctz(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("ctz", this._type)(this._inner), this._type);
  }
  /** Population count (number of set bits). */
  popcnt(): ChainableExpr<T> {
    return new ChainableExpr(makeUnary("popcnt", this._type)(this._inner), this._type);
  }

  // --- eqz (all types → i32) ---

  /** Tests if value equals zero. Returns i32 (0 or 1). */
  eqz(): ChainableExpr<"i32"> {
    const type = this._type;
    return new ChainableExpr(
      (function* (inner: Expr) {
        const va = yield* resolve(inner);
        return val(IR.eqz(va._node, type));
      })(this._inner),
      "i32",
    );
  }

  // --- Conversions (auto-dispatch based on _type) ---

  /** Converts to f64. Dispatches to the appropriate Wasm conversion based on source type. */
  toF64(): ChainableExpr<"f64"> {
    if (this._type === "f64") return this as unknown as ChainableExpr<"f64">;
    const kind: ConvertKind =
      this._type === "i32"
        ? "f64_convert_i32_s"
        : this._type === "i64"
          ? "f64_convert_i64_s"
          : /* f32 */ "f64_promote_f32";
    return new ChainableExpr(makeConvert(kind)(this._inner), "f64");
  }
  /** Converts to i32. Dispatches to the appropriate Wasm conversion based on source type. */
  toI32(): ChainableExpr<"i32"> {
    if (this._type === "i32") return this as unknown as ChainableExpr<"i32">;
    const kind: ConvertKind =
      this._type === "f64"
        ? "i32_trunc_f64_s"
        : this._type === "f32"
          ? "i32_trunc_f32_s"
          : /* i64 */ "i32_wrap_i64";
    return new ChainableExpr(makeConvert(kind)(this._inner), "i32");
  }
  /** Converts to i64. Dispatches to the appropriate Wasm conversion based on source type. */
  toI64(): ChainableExpr<"i64"> {
    if (this._type === "i64") return this as unknown as ChainableExpr<"i64">;
    const kind: ConvertKind =
      this._type === "i32"
        ? "i64_extend_i32_s"
        : this._type === "f64"
          ? "i64_trunc_f64_s"
          : /* f32 */ "i64_trunc_f32_s";
    return new ChainableExpr(makeConvert(kind)(this._inner), "i64");
  }
  /** Converts to f32. Dispatches to the appropriate Wasm conversion based on source type. */
  toF32(): ChainableExpr<"f32"> {
    if (this._type === "f32") return this as unknown as ChainableExpr<"f32">;
    const kind: ConvertKind =
      this._type === "i32"
        ? "f32_convert_i32_s"
        : this._type === "f64"
          ? "f32_demote_f64"
          : /* i64 */ "f32_convert_i64_s";
    return new ChainableExpr(makeConvert(kind)(this._inner), "f32");
  }

  // --- inRange(lo, hi) ---

  /**
   * Tests whether the value is in the half-open range `[lo, hi)`.
   * Equivalent to `this.ge(lo).and(this.lt(hi))` but safe for single-use expressions.
   */
  inRange(lo: ExprInput, hi: ExprInput): ChainableExpr<"i32"> {
    const type = this._type;
    return new ChainableExpr(
      (function* (inner: Expr) {
        const vSelf = yield* resolve(inner);
        const vLo = yield* resolve(lo);
        const vHi = yield* resolve(hi);
        return val(
          IR.binop(
            "and",
            IR.cmp("ge", vSelf._node, vLo._node, type),
            IR.cmp("lt", vSelf._node, vHi._node, type),
          ),
        );
      })(this._inner),
      "i32",
    );
  }

  // --- clamp(min, max) ---

  /**
   * Clamps the value to `[min, max]`.
   * Float types use native `min`/`max` instructions; integer types use `select` + `cmp`.
   */
  clamp(min: ExprInput, max: ExprInput): ChainableExpr<T> {
    const type = this._type;
    const isFloat = type === "f32" || type === "f64";
    return new ChainableExpr(
      (function* (inner: Expr) {
        const vSelf = yield* resolve(inner);
        const vMin = yield* resolve(min);
        const vMax = yield* resolve(max);
        if (isFloat) {
          // f32/f64 have native min/max instructions
          const clamped = IR.binop(
            "min",
            IR.binop("max", vSelf._node, vMin._node, type),
            vMax._node,
            type,
          );
          return val(clamped);
        } else {
          // i32/i64: use select + cmp
          const aboveMin = IR.select(
            vSelf._node,
            vMin._node,
            IR.cmp("gt", vSelf._node, vMin._node, type),
          );
          const belowMax = IR.select(
            aboveMin,
            vMax._node,
            IR.cmp("lt", aboveMin, vMax._node, type),
          );
          return val(belowMax);
        }
      })(this._inner),
      this._type,
    );
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
export function* resolve(expr: ExprInput): Generator<FuncInstruction, WasmVal, any> {
  if (typeof expr === "number") return val(IR.const_i32(expr));
  if (expr instanceof ChainableExpr) return yield* expr;
  if (expr instanceof ThenBuilder) return yield* expr;
  if (expr instanceof WasmRef) return val(IR.local_get(expr._idx));
  if ("_tag" in expr && expr._tag === "val") return expr as WasmVal;
  return yield* expr as FuncGen<WasmVal>;
}

// --- CallableFunc factory ---

/**
 * Creates a {@link CallableFunc} from a function index.
 *
 * The returned object is both callable (for value-returning calls) and
 * has a `.void()` method (for statement calls). It also carries `_tag`
 * and `_idx` so it can be passed to `Mod.export()`.
 */
export function callableFunc(idx: number): CallableFunc {
  const ref: FuncRef = { _tag: "func", _idx: idx };
  return Object.assign((...args: ExprInput[]): FuncGen<WasmVal> => call(ref, ...args), {
    _tag: "func" as const,
    _idx: idx,
    void: (...args: ExprInput[]): FuncGen<void> => call_(ref, ...args),
  });
}

// --- Expression primitives ---

function makeBinop(kind: BinopKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node));
    })();
}

export const add = makeBinop("add");
export const sub = makeBinop("sub");
export const mul = makeBinop("mul");
export const div = makeBinop("div");
export const rem = makeBinop("rem");
export const and_ = makeBinop("and");
export const or_ = makeBinop("or");
export const xor_ = makeBinop("xor");
export const shl = makeBinop("shl");
export const shr = makeBinop("shr");

function makeCmp(kind: CmpKind): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node));
    })();
}

export const eq = makeCmp("eq");
export const ne = makeCmp("ne");
export const lt = makeCmp("lt");
export const gt = makeCmp("gt");
export const le = makeCmp("le");
export const ge = makeCmp("ge");

// --- Unsigned i32 ops ---

export const div_u = makeBinop("div_u");
export const rem_u = makeBinop("rem_u");
export const shr_u = makeBinop("shr_u");
export const lt_u = makeCmp("lt_u");
export const gt_u = makeCmp("gt_u");
export const le_u = makeCmp("le_u");
export const ge_u = makeCmp("ge_u");

// --- Typed binop/cmp factories ---

export function makeBinopTyped(
  kind: BinopKind,
  type: WasmValType,
): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node, type));
    })();
}

export function makeCmpTyped(
  kind: CmpKind,
  type: WasmValType,
): (a: ExprInput, b: ExprInput) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node, type));
    })();
}

export function makeUnary(kind: UnaryKind, type: WasmValType): (a: ExprInput) => FuncGen<WasmVal> {
  return (a) =>
    (function* () {
      const va = yield* resolve(a);
      return val(IR.unary(kind, va._node, type));
    })();
}

export function makeConvert(kind: ConvertKind): (a: ExprInput) => FuncGen<WasmVal> {
  return (a) =>
    (function* () {
      const va = yield* resolve(a);
      return val(IR.convert(kind, va._node));
    })();
}

// --- Select primitive ---

export function select_(cond: ExprInput, ifTrue: ExprInput, ifFalse: ExprInput): FuncGen<WasmVal> {
  return (function* () {
    const vc = yield* resolve(cond);
    const va = yield* resolve(ifTrue);
    const vb = yield* resolve(ifFalse);
    return val(IR.select(va._node, vb._node, vc._node));
  })();
}

// --- Statement primitives ---

/**
 * Executes multiple void statements in sequence.
 * Bridges the `() => VoidStmt[]` array notation into a `yield*`-able generator.
 */
export function run(body: () => VoidStmt[]): FuncGen<void> {
  return (function* () {
    for (const s of body()) yield* s;
  })();
}

export function set(r: WasmRef, value: ExprInput): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_set(r._idx, v._node) };
  })();
}

export function tee(r: WasmRef, value: ExprInput): FuncGen<WasmVal> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_tee(r._idx, v._node) };
    return val(IR.local_get(r._idx));
  })();
}

function call(funcref: FuncRef, ...args: ExprInput[]): FuncGen<WasmVal> {
  return (function* () {
    const resolved = [];
    for (const a of args) {
      resolved.push(yield* resolve(a));
    }
    return val(
      IR.call(
        funcref._idx,
        resolved.map((r) => r._node),
      ),
    );
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
      node: IR.call(
        funcref._idx,
        resolved.map((r) => r._node),
      ),
    };
  })();
}

// --- Control flow primitives ---

function if_impl(
  cond: ExprInput,
  then_: FuncBody<FuncReturn>,
  else_?: FuncBody<FuncReturn>,
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

export class IfBuilder {
  constructor(private readonly _cond: ExprInput) {}
  /** Specifies the then-branch body. Returns a {@link ThenBuilder} for optional `.else()` chaining. */
  then(body: FuncBody<FuncReturn>): ThenBuilder {
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
    private readonly _then: FuncBody<FuncReturn>,
    private readonly _else?: FuncBody<FuncReturn>,
    private readonly _elseIfChain: Array<{ cond: ExprInput; body: FuncBody<FuncReturn> }> = [],
  ) {}

  /** Specifies the else-branch body. Returns a new ThenBuilder (immutable chaining). */
  else(body: FuncBody<FuncReturn>): ThenBuilder {
    return new ThenBuilder(this._cond, this._then, body, this._elseIfChain);
  }

  /** Adds an else-if branch. Chain `.then(body)` to complete it. */
  elseif(cond: ExprInput): ElseIfBuilder {
    return new ElseIfBuilder(
      [{ cond: this._cond, body: this._then }, ...this._elseIfChain],
      cond,
    );
  }

  [Symbol.iterator](): Generator<FuncInstruction, any, any> {
    if (this._elseIfChain.length === 0) {
      return if_impl(this._cond, this._then, this._else);
    }
    const elseBody = this._buildElseChain(0, this._else);
    return if_impl(this._cond, this._then, elseBody);
  }

  private _buildElseChain(
    idx: number,
    finalElse?: FuncBody<FuncReturn>,
  ): FuncBody<FuncReturn> {
    const entry = this._elseIfChain[idx]!;
    const nextElse =
      idx + 1 < this._elseIfChain.length
        ? this._buildElseChain(idx + 1, finalElse)
        : finalElse;
    return function* () {
      return yield* if_impl(entry.cond, entry.body, nextElse);
    };
  }
}

/** Builder for `.elseif(cond)` — call `.then(body)` to complete the branch. */
export class ElseIfBuilder {
  constructor(
    private readonly _chain: Array<{ cond: ExprInput; body: FuncBody<FuncReturn> }>,
    private readonly _cond: ExprInput,
  ) {}

  /** Specifies the body for this else-if branch. */
  then(body: FuncBody<FuncReturn>): ThenBuilder {
    return new ThenBuilder(
      this._chain[0]!.cond,
      this._chain[0]!.body,
      undefined,
      [...this._chain.slice(1), { cond: this._cond, body }],
    );
  }
}
