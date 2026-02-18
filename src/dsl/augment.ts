import { WasmRef, type FuncGen } from "./types";
import {
  type ExprInput,
  ChainableExpr,
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
} from "./expr";

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
