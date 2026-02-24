/**
 * WasmRef prototype augmentation via `declare module` + runtime assignment.
 *
 * Extends {@link WasmRef} with chainable arithmetic, comparison, bitwise,
 * unary, conversion, and in-place mutation methods (e.g. `i.add(1)`,
 * `x.incrBy(dx)`, `n.toF64()`). These methods are the primary way users
 * interact with local variables in the generator DSL.
 *
 * **Pattern:** The `declare module "./types"` block provides compile-time
 * type signatures with `this: WasmRef<IntType>` / `this: WasmRef<FloatType>`
 * constraints to prevent type-invalid operations (e.g. `floatRef.and()`).
 * The runtime implementations use `_valType` for dynamic dispatch.
 *
 * Imported as a side-effect by `primitives.ts` to ensure augmentation
 * is applied before any DSL code runs.
 *
 * @module
 */
import { IR } from "../wasm/ir";
import type { ConvertKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import { WasmRef, val, type FuncGen, type WasmVal, type FuncInstruction } from "./types";
import {
  type ExprInput,
  ChainableExpr,
  makeBinopTyped,
  makeCmpTyped,
  makeUnary,
  makeConvert,
  resolve,
  set,
  tee,
} from "./expr";

type IntType = "i32" | "i64";
type FloatType = "f32" | "f64";

// --- WasmRef method augmentation ---

declare module "./types" {
  interface WasmRef<T extends import("../wasm/opcodes").WasmValType> {
    // --- Type-independent (all refs) ---
    set(value: ExprInput): FuncGen<void>;
    tee(value: ExprInput): ChainableExpr<T>;

    // --- All numeric types — result preserves T ---
    add(b: ExprInput): ChainableExpr<T>;
    sub(b: ExprInput): ChainableExpr<T>;
    mul(b: ExprInput): ChainableExpr<T>;
    div(b: ExprInput): ChainableExpr<T>;

    // --- Integer only — result preserves T ---
    rem(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;

    // --- All numeric types — result always i32 ---
    eq(b: ExprInput): ChainableExpr<"i32">;
    ne(b: ExprInput): ChainableExpr<"i32">;
    lt(b: ExprInput): ChainableExpr<"i32">;
    gt(b: ExprInput): ChainableExpr<"i32">;
    le(b: ExprInput): ChainableExpr<"i32">;
    ge(b: ExprInput): ChainableExpr<"i32">;

    // --- Integer only — result preserves T ---
    and(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;
    or(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;
    xor(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;
    shl(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;
    shr(this: WasmRef<IntType>, b: ExprInput): ChainableExpr<T>;

    // --- In-place mutation — all numeric types ---
    incrBy(b: ExprInput): FuncGen<void>;
    decrBy(b: ExprInput): FuncGen<void>;
    mulBy(b: ExprInput): FuncGen<void>;
    divBy(b: ExprInput): FuncGen<void>;

    // --- In-place mutation — integer only ---
    remBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;
    andBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;
    orBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;
    xorBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;
    shlBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;
    shrBy(this: WasmRef<IntType>, b: ExprInput): FuncGen<void>;

    // --- Float unary ---
    neg(this: WasmRef<FloatType>): ChainableExpr<T>;
    abs(this: WasmRef<FloatType>): ChainableExpr<T>;
    sqrt(this: WasmRef<FloatType>): ChainableExpr<T>;
    ceil(this: WasmRef<FloatType>): ChainableExpr<T>;
    floor(this: WasmRef<FloatType>): ChainableExpr<T>;
    trunc(this: WasmRef<FloatType>): ChainableExpr<T>;
    nearest(this: WasmRef<FloatType>): ChainableExpr<T>;

    // --- Int unary ---
    clz(this: WasmRef<IntType>): ChainableExpr<T>;
    ctz(this: WasmRef<IntType>): ChainableExpr<T>;
    popcnt(this: WasmRef<IntType>): ChainableExpr<T>;
    eqz(): ChainableExpr<"i32">;

    // --- Range check ---
    inRange(lo: ExprInput, hi: ExprInput): ChainableExpr<"i32">;

    // --- Conversions ---
    toF64(): ChainableExpr<"f64">;
    toI32(): ChainableExpr<"i32">;
    toI64(): ChainableExpr<"i64">;
    toF32(): ChainableExpr<"f32">;
  }
}

// --- Helper: typed binop/cmp using _valType ---

// Runtime helpers — type safety is enforced by the `declare module` block above.
// Return types are intentionally `any` to avoid TS fighting with generic prototype assignments.
function binop(kind: string, ref: WasmRef, b: ExprInput): any {
  return new ChainableExpr(makeBinopTyped(kind as any, ref._valType)(ref, b), ref._valType);
}

function cmp(kind: string, ref: WasmRef, b: ExprInput): any {
  return new ChainableExpr(makeCmpTyped(kind as any, ref._valType)(ref, b), "i32");
}

function mutate(kind: string, ref: WasmRef, b: ExprInput): any {
  return set(ref, makeBinopTyped(kind as any, ref._valType)(ref, b));
}

// set & tee
WasmRef.prototype.set = function (this: WasmRef, value: ExprInput) {
  return set(this, value);
};
WasmRef.prototype.tee = function (this: WasmRef, value: ExprInput) {
  return new ChainableExpr(tee(this, value), this._valType);
};

// Arithmetic (all numeric types)
WasmRef.prototype.add = function (this: WasmRef, b: ExprInput) {
  return binop("add", this, b);
};
WasmRef.prototype.sub = function (this: WasmRef, b: ExprInput) {
  return binop("sub", this, b);
};
WasmRef.prototype.mul = function (this: WasmRef, b: ExprInput) {
  return binop("mul", this, b);
};
WasmRef.prototype.div = function (this: WasmRef, b: ExprInput) {
  return binop("div", this, b);
};
WasmRef.prototype.rem = function (this: WasmRef, b: ExprInput) {
  return binop("rem", this, b);
};

// Comparison (all numeric types → i32)
WasmRef.prototype.eq = function (this: WasmRef, b: ExprInput) {
  return cmp("eq", this, b);
};
WasmRef.prototype.ne = function (this: WasmRef, b: ExprInput) {
  return cmp("ne", this, b);
};
WasmRef.prototype.lt = function (this: WasmRef, b: ExprInput) {
  return cmp("lt", this, b);
};
WasmRef.prototype.gt = function (this: WasmRef, b: ExprInput) {
  return cmp("gt", this, b);
};
WasmRef.prototype.le = function (this: WasmRef, b: ExprInput) {
  return cmp("le", this, b);
};
WasmRef.prototype.ge = function (this: WasmRef, b: ExprInput) {
  return cmp("ge", this, b);
};

// Bitwise (integer types only at TS level)
WasmRef.prototype.and = function (this: WasmRef, b: ExprInput) {
  return binop("and", this, b);
};
WasmRef.prototype.or = function (this: WasmRef, b: ExprInput) {
  return binop("or", this, b);
};
WasmRef.prototype.xor = function (this: WasmRef, b: ExprInput) {
  return binop("xor", this, b);
};
WasmRef.prototype.shl = function (this: WasmRef, b: ExprInput) {
  return binop("shl", this, b);
};
WasmRef.prototype.shr = function (this: WasmRef, b: ExprInput) {
  return binop("shr", this, b);
};

// In-place mutation — all numeric types
WasmRef.prototype.incrBy = function (this: WasmRef, b: ExprInput) {
  return mutate("add", this, b);
};
WasmRef.prototype.decrBy = function (this: WasmRef, b: ExprInput) {
  return mutate("sub", this, b);
};
WasmRef.prototype.mulBy = function (this: WasmRef, b: ExprInput) {
  return mutate("mul", this, b);
};
WasmRef.prototype.divBy = function (this: WasmRef, b: ExprInput) {
  return mutate("div", this, b);
};

// In-place mutation — integer only
WasmRef.prototype.remBy = function (this: WasmRef, b: ExprInput) {
  return mutate("rem", this, b);
};
WasmRef.prototype.andBy = function (this: WasmRef, b: ExprInput) {
  return mutate("and", this, b);
};
WasmRef.prototype.orBy = function (this: WasmRef, b: ExprInput) {
  return mutate("or", this, b);
};
WasmRef.prototype.xorBy = function (this: WasmRef, b: ExprInput) {
  return mutate("xor", this, b);
};
WasmRef.prototype.shlBy = function (this: WasmRef, b: ExprInput) {
  return mutate("shl", this, b);
};
WasmRef.prototype.shrBy = function (this: WasmRef, b: ExprInput) {
  return mutate("shr", this, b);
};

// --- Unary operations ---

/** Runtime helper for unary operations. Type safety is enforced by `declare module` above. */
function unary(kind: string, ref: WasmRef): any {
  return new ChainableExpr(makeUnary(kind as any, ref._valType)(ref), ref._valType);
}

// Float unary
WasmRef.prototype.neg = function (this: WasmRef) {
  return unary("neg", this);
};
WasmRef.prototype.abs = function (this: WasmRef) {
  return unary("abs", this);
};
WasmRef.prototype.sqrt = function (this: WasmRef) {
  return unary("sqrt", this);
};
WasmRef.prototype.ceil = function (this: WasmRef) {
  return unary("ceil", this);
};
WasmRef.prototype.floor = function (this: WasmRef) {
  return unary("floor", this);
};
WasmRef.prototype.trunc = function (this: WasmRef) {
  return unary("trunc", this);
};
WasmRef.prototype.nearest = function (this: WasmRef) {
  return unary("nearest", this);
};

// Int unary
WasmRef.prototype.clz = function (this: WasmRef) {
  return unary("clz", this);
};
WasmRef.prototype.ctz = function (this: WasmRef) {
  return unary("ctz", this);
};
WasmRef.prototype.popcnt = function (this: WasmRef) {
  return unary("popcnt", this);
};
WasmRef.prototype.eqz = function (this: WasmRef): any {
  const type = this._valType;
  return new ChainableExpr(
    (function* (ref: WasmRef): Generator<FuncInstruction, WasmVal, any> {
      const va = yield* resolve(ref);
      return val(IR.eqz(va._node, type));
    })(this),
    "i32",
  );
};

// --- Range check ---

WasmRef.prototype.inRange = function (this: WasmRef, lo: ExprInput, hi: ExprInput) {
  return this.ge(lo).and(this.lt(hi));
};

// --- Conversions ---

/** Lookup table: `CONVERT_TABLE[targetType][sourceType]` → ConvertKind, or null for no-op same-type. */
const CONVERT_TABLE: Record<WasmValType, Record<WasmValType, ConvertKind | null>> = {
  i32: { i32: null, i64: "i32_wrap_i64", f32: "i32_trunc_f32_s", f64: "i32_trunc_f64_s" },
  i64: { i32: "i64_extend_i32_s", i64: null, f32: "i64_trunc_f32_s", f64: "i64_trunc_f64_s" },
  f32: { i32: "f32_convert_i32_s", i64: "f32_convert_i64_s", f32: null, f64: "f32_demote_f64" },
  f64: { i32: "f64_convert_i32_s", i64: "f64_convert_i64_s", f32: "f64_promote_f32", f64: null },
};

function convertTo(ref: WasmRef, target: WasmValType): any {
  const kind = CONVERT_TABLE[target][ref._valType];
  if (!kind)
    return new ChainableExpr(
      (function* () {
        return val(IR.local_get(ref._idx));
      })(),
      target,
    );
  return new ChainableExpr(makeConvert(kind)(ref), target);
}

WasmRef.prototype.toF64 = function (this: WasmRef) {
  return convertTo(this, "f64");
};
WasmRef.prototype.toI32 = function (this: WasmRef) {
  return convertTo(this, "i32");
};
WasmRef.prototype.toI64 = function (this: WasmRef) {
  return convertTo(this, "i64");
};
WasmRef.prototype.toF32 = function (this: WasmRef) {
  return convertTo(this, "f32");
};
