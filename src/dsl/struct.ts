import type { WasmValType } from "../wasm/opcodes";
import { Mem } from "./namespaces";
import { ChainableExpr, mul, add, type ExprInput } from "./expr";
import type { FuncGen } from "./types";
import type { BumpAllocator } from "./allocator";

const ALIGN_SIZE: Record<WasmValType, { size: number; align: number }> = {
  i32: { size: 4, align: 4 },
  i64: { size: 8, align: 8 },
  f32: { size: 4, align: 4 },
  f64: { size: 8, align: 8 },
};

interface FieldInfo<T extends WasmValType = WasmValType> {
  offset: number;
  type: T;
}

type FieldSpec = Record<string, WasmValType>;

interface StructArray<F extends FieldSpec> {
  get<K extends keyof F & string>(index: ExprInput, field: K): ChainableExpr<F[K]>;
  set<K extends keyof F & string>(index: ExprInput, field: K, value: ExprInput): FuncGen<void>;
}

interface StructType<F extends FieldSpec> {
  readonly size: number;
  readonly fields: { [K in keyof F]: FieldInfo<F[K]> };

  get<K extends keyof F & string>(base: ExprInput, field: K): ChainableExpr<F[K]>;
  set<K extends keyof F & string>(base: ExprInput, field: K, value: ExprInput): FuncGen<void>;

  array(allocator: BumpAllocator, count: number): StructArray<F>;
}

function loadTyped(addr: ExprInput, type: WasmValType): ChainableExpr<any> {
  switch (type) {
    case "i32": return Mem.load(addr);
    case "i64": return Mem.loadI64(addr);
    case "f32": return Mem.loadF32(addr);
    case "f64": return Mem.loadF64(addr);
  }
}

function storeTyped(addr: ExprInput, value: ExprInput, type: WasmValType): FuncGen<void> {
  switch (type) {
    case "i32": return Mem.store(addr, value);
    case "i64": return Mem.storeI64(addr, value);
    case "f32": return Mem.storeF32(addr, value);
    case "f64": return Mem.storeF64(addr, value);
  }
}

/**
 * Defines a struct type with automatic field offset/alignment calculation.
 * All layout is computed at compile time — zero runtime overhead.
 */
export function Struct<F extends FieldSpec>(spec: F): StructType<F> {
  const entries = Object.entries(spec) as [string, WasmValType][];

  // Calculate field offsets
  let offset = 0;
  let maxAlign = 1;
  const fields = {} as { [K in keyof F]: FieldInfo<F[K]> };

  for (const [name, type] of entries) {
    const { size, align } = ALIGN_SIZE[type];
    maxAlign = Math.max(maxAlign, align);
    offset = Math.ceil(offset / align) * align;
    (fields as any)[name] = { offset, type };
    offset += size;
  }

  // Pad struct size to max alignment
  const structSize = Math.ceil(offset / maxAlign) * maxAlign;

  function fieldAddr(base: ExprInput, fieldName: string): ExprInput {
    const f = (fields as any)[fieldName] as FieldInfo;
    return f.offset === 0 ? base : new ChainableExpr(add(base, f.offset));
  }

  return {
    size: structSize,
    fields,

    get<K extends keyof F & string>(base: ExprInput, field: K): ChainableExpr<F[K]> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return loadTyped(fieldAddr(base, field), f.type);
    },

    set<K extends keyof F & string>(base: ExprInput, field: K, value: ExprInput): FuncGen<void> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return storeTyped(fieldAddr(base, field), value, f.type);
    },

    array(allocator: BumpAllocator, count: number): StructArray<F> {
      const arrayBase = allocator.alloc(count * structSize, maxAlign);

      function elementAddr(index: ExprInput, fieldName: string): ExprInput {
        const f = (fields as any)[fieldName] as FieldInfo;
        const baseExpr = new ChainableExpr(mul(index, structSize));
        const withArrayBase = arrayBase === 0 ? baseExpr : baseExpr.add(arrayBase);
        return f.offset === 0 ? withArrayBase : withArrayBase.add(f.offset);
      }

      return {
        get<K extends keyof F & string>(index: ExprInput, field: K): ChainableExpr<F[K]> {
          const f = (fields as any)[field] as FieldInfo<F[K]>;
          return loadTyped(elementAddr(index, field), f.type);
        },

        set<K extends keyof F & string>(index: ExprInput, field: K, value: ExprInput): FuncGen<void> {
          const f = (fields as any)[field] as FieldInfo<F[K]>;
          return storeTyped(elementAddr(index, field), value, f.type);
        },
      };
    },
  };
}
