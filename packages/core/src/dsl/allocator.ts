import { Mem } from "./namespaces";
import { ChainableExpr, mul, type ExprInput } from "./expr";
import type { FuncGen } from "./types";

/** A tracked memory region for overlap detection. */
export interface MemoryRegion {
  label: string;
  offset: number;
  size: number;
}

/**
 * Compile-time bump allocator for Wasm linear memory layout.
 *
 * All offsets are determined at compile time (during `compile()` execution),
 * so there is zero runtime overhead — every address becomes an i32 constant.
 */
export class BumpAllocator {
  private _offset = 0;
  private _regions: MemoryRegion[] = [];

  /** Allocates `bytes` bytes with the given alignment. Returns the base byte offset. */
  alloc(bytes: number, align: number = 4, label?: string): number {
    this._offset = Math.ceil(this._offset / align) * align;
    const base = this._offset;
    this._offset += bytes;
    if (label) {
      this._regions.push({ label, offset: base, size: bytes });
    }
    return base;
  }

  /** Allocates an i32 array and returns a Mem.i32Array helper bound to the allocated offset. */
  i32Array(count: number, label?: string) {
    const base = this.alloc(count * 4, 4, label);
    return Mem.i32Array(base);
  }

  /** Allocates an i64 array region. Returns object with `load(idx)` and `store(idx, value)`. */
  i64Array(count: number, label?: string): {
    base: number;
    load(idx: ExprInput): ChainableExpr<"i64">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const base = this.alloc(count * 8, 8, label);
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
  f64Array(count: number, label?: string): {
    base: number;
    load(idx: ExprInput): ChainableExpr<"f64">;
    store(idx: ExprInput, value: ExprInput): FuncGen<void>;
  } {
    const base = this.alloc(count * 8, 8, label);
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
  i32Array2D(rows: number, cols: number, label?: string) {
    const base = this.alloc(rows * cols * 4, 4, label);
    return Mem.i32Array2D(base, cols);
  }

  /** Allocates a raw byte region. Returns the base byte offset. */
  bytes(count: number, label?: string): number {
    return this.alloc(count, 1, label);
  }

  /** Registers a manual memory region for overlap detection. */
  registerRegion(region: MemoryRegion): void {
    this._regions.push(region);
  }

  /** All tracked memory regions. */
  get regions(): readonly MemoryRegion[] {
    return this._regions;
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

/**
 * Checks all memory regions across allocators for overlap.
 * Returns an array of overlap error messages.
 */
export function checkRegionOverlaps(allocators: BumpAllocator[]): string[] {
  const allRegions: MemoryRegion[] = [];
  for (const a of allocators) {
    allRegions.push(...a.regions);
  }
  const errors: string[] = [];
  for (let i = 0; i < allRegions.length; i++) {
    const a = allRegions[i]!;
    const aEnd = a.offset + a.size;
    for (let j = i + 1; j < allRegions.length; j++) {
      const b = allRegions[j]!;
      const bEnd = b.offset + b.size;
      if (a.offset < bEnd && b.offset < aEnd) {
        errors.push(
          `Memory region overlap: '${a.label}' [${a.offset}..${aEnd}) and '${b.label}' [${b.offset}..${bEnd})`,
        );
      }
    }
  }
  return errors;
}
