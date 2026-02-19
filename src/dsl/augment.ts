import { WasmRef } from "./types";
import {
  type ExprInput,
  ChainableExpr,
  makeBinopTyped,
  makeCmpTyped,
  set,
  tee,
} from "./expr";

type IntType = "i32" | "i64";

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
  }
}

// --- Helper: typed binop/cmp using _valType ---

// Runtime helpers — type safety is enforced by the `declare module` block above.
// Return types are intentionally `any` to avoid TS fighting with generic prototype assignments.
function binop(kind: string, ref: WasmRef, b: ExprInput): any {
  return new ChainableExpr(
    makeBinopTyped(kind as any, ref._valType)(ref, b),
    ref._valType,
  );
}

function cmp(kind: string, ref: WasmRef, b: ExprInput): any {
  return new ChainableExpr(
    makeCmpTyped(kind as any, ref._valType)(ref, b),
    "i32",
  );
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
WasmRef.prototype.add = function (this: WasmRef, b: ExprInput) { return binop("add", this, b); };
WasmRef.prototype.sub = function (this: WasmRef, b: ExprInput) { return binop("sub", this, b); };
WasmRef.prototype.mul = function (this: WasmRef, b: ExprInput) { return binop("mul", this, b); };
WasmRef.prototype.div = function (this: WasmRef, b: ExprInput) { return binop("div", this, b); };
WasmRef.prototype.rem = function (this: WasmRef, b: ExprInput) { return binop("rem", this, b); };

// Comparison (all numeric types → i32)
WasmRef.prototype.eq = function (this: WasmRef, b: ExprInput) { return cmp("eq", this, b); };
WasmRef.prototype.ne = function (this: WasmRef, b: ExprInput) { return cmp("ne", this, b); };
WasmRef.prototype.lt = function (this: WasmRef, b: ExprInput) { return cmp("lt", this, b); };
WasmRef.prototype.gt = function (this: WasmRef, b: ExprInput) { return cmp("gt", this, b); };
WasmRef.prototype.le = function (this: WasmRef, b: ExprInput) { return cmp("le", this, b); };
WasmRef.prototype.ge = function (this: WasmRef, b: ExprInput) { return cmp("ge", this, b); };

// Bitwise (integer types only at TS level)
WasmRef.prototype.and = function (this: WasmRef, b: ExprInput) { return binop("and", this, b); };
WasmRef.prototype.or = function (this: WasmRef, b: ExprInput) { return binop("or", this, b); };
WasmRef.prototype.xor = function (this: WasmRef, b: ExprInput) { return binop("xor", this, b); };
WasmRef.prototype.shl = function (this: WasmRef, b: ExprInput) { return binop("shl", this, b); };
WasmRef.prototype.shr = function (this: WasmRef, b: ExprInput) { return binop("shr", this, b); };

// In-place mutation — all numeric types
WasmRef.prototype.incrBy = function (this: WasmRef, b: ExprInput) { return mutate("add", this, b); };
WasmRef.prototype.decrBy = function (this: WasmRef, b: ExprInput) { return mutate("sub", this, b); };
WasmRef.prototype.mulBy = function (this: WasmRef, b: ExprInput) { return mutate("mul", this, b); };
WasmRef.prototype.divBy = function (this: WasmRef, b: ExprInput) { return mutate("div", this, b); };

// In-place mutation — integer only
WasmRef.prototype.remBy = function (this: WasmRef, b: ExprInput) { return mutate("rem", this, b); };
WasmRef.prototype.andBy = function (this: WasmRef, b: ExprInput) { return mutate("and", this, b); };
WasmRef.prototype.orBy = function (this: WasmRef, b: ExprInput) { return mutate("or", this, b); };
WasmRef.prototype.xorBy = function (this: WasmRef, b: ExprInput) { return mutate("xor", this, b); };
WasmRef.prototype.shlBy = function (this: WasmRef, b: ExprInput) { return mutate("shl", this, b); };
WasmRef.prototype.shrBy = function (this: WasmRef, b: ExprInput) { return mutate("shr", this, b); };
