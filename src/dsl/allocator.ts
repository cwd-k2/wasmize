import { Mem } from "./namespaces";
import { ChainableExpr, mul, type ExprInput } from "./expr";
import type { FuncGen } from "./types";

/**
 * Compile-time bump allocator for Wasm linear memory layout.
 *
 * All offsets are determined at compile time (during `compile()` execution),
 * so there is zero runtime overhead — every address becomes an i32 constant.
 */
export class BumpAllocator {
  private _offset = 0;

  /** Allocates `bytes` bytes with the given alignment. Returns the base byte offset. */
  alloc(bytes: number, align: number = 4): number {
    this._offset = Math.ceil(this._offset / align) * align;
    const base = this._offset;
    this._offset += bytes;
    return base;
  }

  /** Allocates an i32 array and returns a Mem.i32Array helper bound to the allocated offset. */
  i32Array(count: number) {
    const base = this.alloc(count * 4, 4);
    return Mem.i32Array(base);
  }

  /** Allocates an i64 array region. Returns object with `load(idx)` and `store(idx, value)`. */
  i64Array(count: number): {
    base: number;
    load(idx: ExprInput): ChainableExpr<"i64">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const base = this.alloc(count * 8, 8);
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 8));
      return base === 0 ? scaled : scaled.add(base);
    };
    return {
      base,
      load: (idx: ExprInput) => Mem.loadI64(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput) => Mem.storeI64(addrOf(idx), value),
    };
  }

  /** Allocates an f64 array region. Returns object with `load(idx)` and `store(idx, value)`. */
  f64Array(count: number): {
    base: number;
    load(idx: ExprInput): ChainableExpr<"f64">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const base = this.alloc(count * 8, 8);
    const addrOf = (idx: ExprInput): ChainableExpr => {
      const scaled = new ChainableExpr(mul(idx, 8));
      return base === 0 ? scaled : scaled.add(base);
    };
    return {
      base,
      load: (idx: ExprInput) => Mem.loadF64(addrOf(idx)),
      store: (idx: ExprInput, value: ExprInput) => Mem.storeF64(addrOf(idx), value),
    };
  }

  /** Allocates a 2D i32 array and returns a Mem.i32Array2D helper. */
  i32Array2D(rows: number, cols: number) {
    const base = this.alloc(rows * cols * 4, 4);
    return Mem.i32Array2D(base, cols);
  }

  /** Allocates a raw byte region. Returns the base byte offset. */
  bytes(count: number): number {
    return this.alloc(count, 1);
  }

  /** Total bytes allocated so far. */
  get usedBytes(): number {
    return this._offset;
  }

  /** Minimum Wasm memory pages required (1 page = 64KB). */
  get requiredPages(): number {
    return Math.ceil(this._offset / 65536) || 1;
  }
}
