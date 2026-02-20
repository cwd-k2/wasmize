/**
 * Barrel re-export for DSL primitives.
 *
 * Imports `augment.ts` as a side-effect to ensure WasmRef prototype
 * methods are available before any DSL code runs. Aggregates all
 * user-facing DSL exports from their respective modules.
 *
 * @module
 */
// Side-effect: augments WasmRef.prototype with chainable methods
import "./augment";

export { type ExprInput, type CallableFunc, ChainableExpr, ThenBuilder, ElseIfBuilder } from "./expr";

export { param, local, Type } from "./declarations";

export { Mod, Op, Mem, Ctrl, Loc, SwitchCaseBuilder, SwitchDefaultBuilder } from "./namespaces";
export { BumpAllocator } from "./allocator";
export { Struct, FieldAccessor, type FieldType, type FieldResultType } from "./struct";
export { Str } from "./string";
export { Meta } from "./meta";
export { Queue, type QueueHandle } from "./queue";
export { Stack, type StackHandle } from "./stack";
export { RingBuffer, type RingBufferHandle } from "./ringbuffer";
export { BitSet, type BitSetHandle } from "./bitset";
export { type ScopeHandle } from "./types";

/** RGBA pixel Struct preset (4 packed u8 fields). `RGBA.at(offset)` returns a proxy with `.r`, `.g`, `.b`, `.a` FieldAccessors. */
import { Struct as _Struct } from "./struct";
export const RGBA = _Struct({ r: "u8", g: "u8", b: "u8", a: "u8" });

// Top-level constant helpers (chainable, shorter than Mem.i32/f64/i64)
export { i32, i64, f64 } from "./namespaces";
