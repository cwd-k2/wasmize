/**
 * Struct type system with automatic field offset/alignment calculation.
 *
 * Provides compile-time struct layout for Wasm linear memory:
 * - {@link Struct} factory computes field offsets respecting natural alignment.
 * - Supports packed sub-word fields (`u8`, `u16`) that use byte/half-word
 *   memory instructions but appear as `i32` on the Wasm stack.
 * - {@link FieldAccessor} extends `ChainableExpr` with `.set()` and in-place
 *   mutation methods (`incrBy`, `decrBy`, etc.) using load-modify-store patterns.
 * - Proxy-based `StructAccessor` enables object-style access: `p.x.add(p.y)`.
 * - `StructArray` provides indexed access into arrays of structs.
 *
 * All layout computation happens at JS compile time — zero Wasm runtime overhead.
 *
 * @module
 */
import type { WasmValType } from "../wasm/opcodes";
import { IR } from "../wasm/ir";
import type { BinopKind, IRNode } from "../wasm/ir";
import { Mem } from "./namespaces";
import { ChainableExpr, resolve, mul, add, set, type ExprInput } from "./expr";
import { val, WasmRef, type FuncGen, type WasmVal, type FuncInstruction } from "./types";
import type { BumpAllocator } from "./allocator";
import { local, Type } from "./declarations";

// --- Field types ---

/**
 * Extended field type supporting packed sub-word types.
 * `"u8"` and `"u16"` are stored in memory with 1/2-byte instructions but loaded as i32 on the Wasm stack.
 */
export type FieldType = WasmValType | "u8" | "u16";

/** Maps a {@link FieldType} to its Wasm stack type. Packed types (`u8`/`u16`) become `"i32"`. */
export type FieldResultType<T extends FieldType> = T extends "u8" | "u16" ? "i32" : T;

function stackType(ft: FieldType): WasmValType {
  return ft === "u8" || ft === "u16" ? "i32" : ft;
}

const ALIGN_SIZE: Record<FieldType, { size: number; align: number }> = {
  i32: { size: 4, align: 4 },
  i64: { size: 8, align: 8 },
  f32: { size: 4, align: 4 },
  f64: { size: 8, align: 8 },
  u8: { size: 1, align: 1 },
  u16: { size: 2, align: 2 },
};

export interface FieldInfo<T extends FieldType = FieldType> {
  offset: number;
  type: T;
}

export type FieldSpec = Record<string, FieldType>;

// --- IR-level load/store helpers (FieldType-aware) ---

function loadIR(addr: IRNode, type: FieldType): IRNode {
  switch (type) {
    case "i32":
      return IR.load_i32(addr);
    case "i64":
      return IR.load_i64(addr);
    case "f32":
      return IR.mem_load("f32_load", addr);
    case "f64":
      return IR.load_f64(addr);
    case "u8":
      return IR.load_i32_8u(addr);
    case "u16":
      return IR.mem_load("i32_load16_u", addr);
  }
}

function storeIR(addr: IRNode, value: IRNode, type: FieldType): IRNode {
  switch (type) {
    case "i32":
      return IR.store_i32(addr, value);
    case "i64":
      return IR.store_i64(addr, value);
    case "f32":
      return IR.mem_store("f32_store", addr, value);
    case "f64":
      return IR.store_f64(addr, value);
    case "u8":
      return IR.store_i32_8(addr, value);
    case "u16":
      return IR.mem_store("i32_store16", addr, value);
  }
}

// --- FieldAccessor: ChainableExpr with .set() and mutation for struct field access ---

/** Creates a load expression for the given address and field type. */
function makeLoadExpr(addr: ExprInput, type: FieldType): FuncGen<WasmVal> {
  return (function* () {
    const va = yield* resolve(addr);
    return val(loadIR(va._node, type));
  })() as FuncGen<WasmVal>;
}

/**
 * A memory-backed field that extends {@link ChainableExpr} with `.set()` and in-place mutation.
 *
 * Supports packed types (`u8`/`u16`) — loads/stores use the appropriate sub-word instructions,
 * while the stack type is always `i32`.
 *
 * Returned by `Struct.at()`, `StructArray.at()`, and `Mem.i32Array().at()`.
 *
 * @example
 * ```ts
 * const p = points.at(i);
 * yield* p.x.incrBy(dx);  // in-place mutation
 * yield* p.y.set(0);      // direct write
 * return p.x.add(p.y);    // read as ChainableExpr
 * ```
 */
export class FieldAccessor<T extends WasmValType = WasmValType> extends ChainableExpr<T> {
  private readonly _storeType: FieldType;

  constructor(
    private readonly _addr: ExprInput,
    storeType: FieldType,
  ) {
    super(makeLoadExpr(_addr, storeType), stackType(storeType) as T);
    this._storeType = storeType;
  }

  /** Writes a value to this memory location. */
  set(value: ExprInput): FuncGen<void> {
    return storeTyped(this._addr, value, this._storeType);
  }

  /** Emits load-modify-store for the given binary operation. Address is resolved once and reused. */
  private _mutate(kind: BinopKind, v: ExprInput): FuncGen<void> {
    const storeType = this._storeType;
    const st = stackType(storeType);
    return (function* (addr: ExprInput) {
      const va = yield* resolve(addr);
      const addrNode = va._node;
      const current = loadIR(addrNode, storeType);
      const vv = yield* resolve(v);
      const updated = IR.binop(kind, current, vv._node, st);
      yield { _type: "stmt", node: storeIR(addrNode, updated, storeType) } as FuncInstruction;
    })(this._addr);
  }

  incrBy(v: ExprInput): FuncGen<void> {
    return this._mutate("add", v);
  }
  decrBy(v: ExprInput): FuncGen<void> {
    return this._mutate("sub", v);
  }
  mulBy(v: ExprInput): FuncGen<void> {
    return this._mutate("mul", v);
  }
  divBy(v: ExprInput): FuncGen<void> {
    return this._mutate("div", v);
  }
  remBy(v: ExprInput): FuncGen<void> {
    return this._mutate("rem", v);
  }
  andBy(v: ExprInput): FuncGen<void> {
    return this._mutate("and", v);
  }
  orBy(v: ExprInput): FuncGen<void> {
    return this._mutate("or", v);
  }
  xorBy(v: ExprInput): FuncGen<void> {
    return this._mutate("xor", v);
  }
  shlBy(v: ExprInput): FuncGen<void> {
    return this._mutate("shl", v);
  }
  shrBy(v: ExprInput): FuncGen<void> {
    return this._mutate("shr", v);
  }
}

// --- StructAccessor: proxy-based object-style field access ---

export type StructAccessor<F extends FieldSpec> = {
  readonly [K in keyof F]: FieldAccessor<FieldResultType<F[K]>>;
};

function makeAccessor<F extends FieldSpec>(
  fields: { [K in keyof F]: FieldInfo<F[K]> },
  addrOf: (fieldName: string) => ExprInput,
): StructAccessor<F> {
  return new Proxy({} as StructAccessor<F>, {
    get(_, prop: string) {
      if (prop in (fields as object)) {
        const f = (fields as any)[prop] as FieldInfo;
        return new FieldAccessor(addrOf(prop), f.type);
      }
      return undefined;
    },
  });
}

// --- Struct interfaces ---

export interface StructArray<F extends FieldSpec> {
  get<K extends keyof F & string>(index: ExprInput, field: K): ChainableExpr<FieldResultType<F[K]>>;
  set<K extends keyof F & string>(index: ExprInput, field: K, value: ExprInput): FuncGen<void>;
  at(index: ExprInput): StructAccessor<F>;
  snapshot<K extends keyof F & string>(
    index: ExprInput,
    ...fields: K[]
  ): FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }>;
  forEach(
    count: ExprInput,
    body: (
      accessor: StructAccessor<F>,
      index: WasmRef<"i32">,
    ) => Generator<FuncInstruction, void, any>,
  ): FuncGen<void>;
}

export interface StructType<F extends FieldSpec> {
  readonly size: number;
  readonly fields: { [K in keyof F]: FieldInfo<F[K]> };

  get<K extends keyof F & string>(base: ExprInput, field: K): ChainableExpr<FieldResultType<F[K]>>;
  set<K extends keyof F & string>(base: ExprInput, field: K, value: ExprInput): FuncGen<void>;

  at(base: ExprInput): StructAccessor<F>;
  array(allocator: BumpAllocator, count: number): StructArray<F>;
  arrayAt(base: number): StructArray<F>;
  snapshot<K extends keyof F & string>(
    base: ExprInput,
    ...fields: K[]
  ): FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }>;
}

// --- StructArray factory ---

function makeStructArray<F extends FieldSpec>(
  arrayBase: number,
  structSize: number,
  fields: { [K in keyof F]: FieldInfo<F[K]> },
): StructArray<F> {
  function elementAddr(index: ExprInput, fieldName: string): ExprInput {
    const f = (fields as any)[fieldName] as FieldInfo;
    const baseExpr = new ChainableExpr(mul(index, structSize));
    const withArrayBase = arrayBase === 0 ? baseExpr : baseExpr.add(arrayBase);
    return f.offset === 0 ? withArrayBase : withArrayBase.add(f.offset);
  }

  return {
    get<K extends keyof F & string>(
      index: ExprInput,
      field: K,
    ): ChainableExpr<FieldResultType<F[K]>> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return loadTyped(elementAddr(index, field), f.type);
    },

    set<K extends keyof F & string>(
      index: ExprInput,
      field: K,
      value: ExprInput,
    ): FuncGen<void> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return storeTyped(elementAddr(index, field), value, f.type);
    },

    at(index: ExprInput): StructAccessor<F> {
      return makeAccessor(fields, (name) => elementAddr(index, name));
    },

    snapshot<K extends keyof F & string>(
      index: ExprInput,
      ...fieldNames: K[]
    ): FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }> {
      return (function* () {
        const result = {} as { [P in K]: WasmRef<FieldResultType<F[P]>> };
        for (const name of fieldNames) {
          const f = (fields as any)[name] as FieldInfo;
          const st = stackType(f.type);
          const ref = yield* local(st as any);
          yield* set(ref, loadTyped(elementAddr(index, name), f.type));
          (result as any)[name] = ref;
        }
        return result;
      })() as FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }>;
    },

    forEach(
      count: ExprInput,
      body: (
        accessor: StructAccessor<F>,
        index: WasmRef<"i32">,
      ) => Generator<FuncInstruction, void, any>,
    ): FuncGen<void> {
      return (function* () {
        const idx: WasmRef<"i32"> = yield* local(Type.i32, 0);
        yield {
          _type: "block" as const,
          body: function* () {
            yield {
              _type: "loop" as const,
              body: function* () {
                const vc = yield* resolve(idx.ge(count));
                yield { _type: "stmt" as const, node: IR.br_if(1, vc._node) };
                const accessor = makeAccessor(fields, (name) => elementAddr(idx, name));
                yield* body(accessor, idx);
                yield* set(idx, idx.add(1));
                yield { _type: "stmt" as const, node: IR.br(0) };
              },
            };
          },
        };
      })();
    },
  };
}

// --- Helpers ---

function loadTyped(addr: ExprInput, type: FieldType): ChainableExpr<any> {
  switch (type) {
    case "i32":
      return Mem.load(addr);
    case "i64":
      return Mem.loadI64(addr);
    case "f32":
      return Mem.loadF32(addr);
    case "f64":
      return Mem.loadF64(addr);
    case "u8":
      return Mem.load8(addr);
    case "u16":
      return Mem.load16u(addr);
  }
}

function storeTyped(addr: ExprInput, value: ExprInput, type: FieldType): FuncGen<void> {
  switch (type) {
    case "i32":
      return Mem.store(addr, value);
    case "i64":
      return Mem.storeI64(addr, value);
    case "f32":
      return Mem.storeF32(addr, value);
    case "f64":
      return Mem.storeF64(addr, value);
    case "u8":
      return Mem.store8(addr, value);
    case "u16":
      return Mem.store16(addr, value);
  }
}

/**
 * Defines a struct type with automatic field offset/alignment calculation.
 * All layout is computed at compile time — zero runtime overhead.
 */
export function Struct<F extends FieldSpec>(spec: F): StructType<F> {
  const entries = Object.entries(spec) as [string, FieldType][];

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

    get<K extends keyof F & string>(
      base: ExprInput,
      field: K,
    ): ChainableExpr<FieldResultType<F[K]>> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return loadTyped(fieldAddr(base, field), f.type);
    },

    set<K extends keyof F & string>(base: ExprInput, field: K, value: ExprInput): FuncGen<void> {
      const f = (fields as any)[field] as FieldInfo<F[K]>;
      return storeTyped(fieldAddr(base, field), value, f.type);
    },

    at(base: ExprInput): StructAccessor<F> {
      return makeAccessor(fields, (name) => fieldAddr(base, name));
    },

    snapshot<K extends keyof F & string>(
      base: ExprInput,
      ...fieldNames: K[]
    ): FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }> {
      return (function* () {
        const result = {} as { [P in K]: WasmRef<FieldResultType<F[P]>> };
        for (const name of fieldNames) {
          const f = (fields as any)[name] as FieldInfo;
          const st = stackType(f.type);
          const ref = yield* local(st as any);
          yield* set(ref, loadTyped(fieldAddr(base, name), f.type));
          (result as any)[name] = ref;
        }
        return result;
      })() as FuncGen<{ [P in K]: WasmRef<FieldResultType<F[P]>> }>;
    },

    array(allocator: BumpAllocator, count: number): StructArray<F> {
      const arrayBase = allocator.alloc(count * structSize, maxAlign);
      return makeStructArray(arrayBase, structSize, fields);
    },

    arrayAt(base: number): StructArray<F> {
      return makeStructArray(base, structSize, fields);
    },
  };
}
