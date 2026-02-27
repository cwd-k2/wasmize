import type { IRNode } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";

// --- Opaque references ---

/**
 * Opaque reference to a local variable or parameter slot.
 *
 * Obtained via {@link param} or {@link local}; passed to {@link get}, {@link set}, and {@link tee}.
 * The internal index is managed by the interpreter — user code should treat this as opaque.
 */
export class WasmRef<T extends WasmValType = WasmValType> {
  readonly _tag = "ref" as const;
  constructor(
    readonly _idx: number,
    readonly _valType: T = "i32" as T,
  ) {}
}

/**
 * Opaque wrapper around an IR node representing a computed value.
 *
 * Produced by expression primitives (e.g. {@link i32}, {@link add}, {@link get}).
 * Can be used directly as an {@link Expr} or combined with other expressions.
 */
export interface WasmVal {
  readonly _tag: "val";
  readonly _node: IRNode;
}

/**
 * Opaque reference to a function by its index in the module.
 *
 * Obtained via {@link func} or {@link import_}; passed to {@link call}, {@link call_}, and {@link export_}.
 */
export interface FuncRef {
  readonly _tag: "func";
  readonly _idx: number;
}

/**
 * Creates a {@link WasmRef} pointing to the given local/param index.
 * @param idx - The slot index
 * @returns A new opaque reference
 */
export function ref<T extends WasmValType = WasmValType>(idx: number, valType?: T): WasmRef<T> {
  return new WasmRef(idx, valType);
}

/**
 * Wraps an IR node into a {@link WasmVal}.
 * @param node - The IR node to wrap
 * @returns A new opaque value
 */
export function val(node: IRNode): WasmVal {
  return { _tag: "val", _node: node };
}

/**
 * Creates a {@link FuncRef} pointing to the given function index.
 * @param idx - The function index
 * @returns A new opaque function reference
 */
export function funcRef(idx: number): FuncRef {
  return { _tag: "func", _idx: idx };
}

// --- Phantom-typed binary ---

/**
 * A compiled Wasm binary that carries its export signature at the type level.
 *
 * At runtime this is a plain `Uint8Array`; the phantom `__exports` field
 * exists only for TypeScript inference so that {@link instantiate} can
 * return correctly typed `exports` without manual casts.
 *
 * @typeParam T - The record of exported functions (e.g. `{ fib: (n: number) => number }`)
 */
export type WasmBinary<T = Record<string, unknown>> = Uint8Array & {
  readonly __exports?: T;
};

// --- Generator types ---

/**
 * Generator yielded by function-level primitives.
 * Compose with `yield*` inside a function body.
 * @typeParam T - The value type produced when the generator completes
 */
export type FuncGen<T> = Generator<FuncInstruction, T, any>;

/**
 * Generator yielded by module-level primitives.
 * Compose with `yield*` at the top level of a {@link WasmProgram}.
 * @typeParam T - The value type produced when the generator completes
 */
export type ModuleGen<T> = Generator<ModuleInstruction, T, any>;

/**
 * Factory function that creates a function-level generator on demand.
 * Used as the `body` argument for {@link func}, {@link if_}, {@link loop_}, and {@link block_}
 * to enable deferred (lazy) execution of the body.
 * @typeParam T - The value type produced by the body
 */
export type FuncBody<T> = () => Generator<FuncInstruction, T, any>;

/**
 * Any value that can appear in a void statement array.
 *
 * Matches both `FuncGen<void>` (generators from set/store/Ctrl sugar)
 * and `ThenBuilder` / `ChainableExpr` (iterables with `[Symbol.iterator]`).
 */
export type VoidStmt = {
  [Symbol.iterator](): Generator<FuncInstruction, any, any>;
};

/**
 * Void body that supports both generator and array notation.
 *
 * - `FuncBody<void>` — traditional `function*() { yield* a(); yield* b(); }`
 * - `() => VoidStmt[]` — shorthand `() => [a(), b()]`
 */
export type VoidBody = FuncBody<void> | (() => VoidStmt[]);

/**
 * Factory function for the top-level module program.
 * Pass to {@link compile} to produce a Wasm binary.
 *
 * @example
 * ```ts
 * const program: WasmProgram = function* () {
 *   const f = yield* func(function* () { return yield* i32(42); });
 *   yield* export_("main", f);
 * };
 * const binary = compile(program);
 * ```
 */
export type WasmProgram = () => Generator<ModuleInstruction, void, any>;

/**
 * Expression type: a value, generator, reference, or raw number.
 *
 * - `WasmVal` — already-resolved IR value
 * - `FuncGen<WasmVal>` — lazy generator that produces one
 * - `WasmRef` — auto-resolved to `local_get`
 * - `number` — auto-resolved to `i32.const`
 *
 * Use {@link resolve} to normalize any `Expr` to a `WasmVal`.
 */
export type Expr = WasmVal | FuncGen<WasmVal> | WasmRef | number;

/**
 * Allowed return types from function bodies.
 * The interpreter coerces these to `WasmVal`:
 * - `WasmVal` — returned as-is
 * - `WasmRef` — coerced to `local_get`
 * - `number` — coerced to `i32.const`
 * - `void` — no return value
 */
export type FuncReturn = WasmVal | WasmRef | number | void;

// --- Function-level instructions ---

/**
 * Instruction to declare a parameter or local variable.
 * Yielded by {@link param} and {@link local}; the interpreter allocates
 * an index and sends back a {@link WasmRef}.
 */
export interface DeclInstruction {
  /** Discriminant tag for instruction dispatch. */
  _type: "decl";
  /** Whether this declares a parameter or a local variable. */
  kind: "param" | "local";
  /** The Wasm value type (e.g. `"i32"`, `"i64"`). */
  valType: WasmValType;
}

/**
 * Instruction wrapping a single IR statement node.
 * Yielded by statement primitives (e.g. {@link set}, {@link store}).
 */
export interface StmtInstruction {
  /** Discriminant tag for instruction dispatch. */
  _type: "stmt";
  /** The IR node representing the statement. */
  node: IRNode;
}

/**
 * Instruction for conditional branching (`if`/`else`).
 * Yielded by {@link if_}; the interpreter recursively interprets both branches.
 */
export interface IfInstruction {
  /** Discriminant tag for instruction dispatch. */
  _type: "if";
  /** The condition IR node (should evaluate to i32). */
  cond: IRNode;
  /** Body executed when the condition is truthy. */
  then_: FuncBody<FuncReturn>;
  /** Optional body executed when the condition is falsy. */
  else_?: FuncBody<FuncReturn>;
}

/**
 * Instruction for a Wasm `loop` block.
 * Yielded by {@link loop_}; use {@link br} to jump back to the loop header.
 */
export interface LoopInstruction {
  /** Discriminant tag for instruction dispatch. */
  _type: "loop";
  /** The loop body factory. */
  body: FuncBody<void>;
}

/**
 * Instruction for a Wasm `block`.
 * Yielded by {@link block_}; use {@link br} to break out of the block.
 */
export interface BlockInstruction {
  /** Discriminant tag for instruction dispatch. */
  _type: "block";
  /** The block body factory. */
  body: FuncBody<void>;
}

/**
 * Discriminated union of all function-level instructions.
 * The `_type` field determines which variant is active.
 */
export type FuncInstruction =
  | DeclInstruction
  | StmtInstruction
  | IfInstruction
  | LoopInstruction
  | BlockInstruction;

/**
 * Opaque reference to a global variable by its index in the module.
 */
export interface GlobalRef {
  readonly _tag: "global";
  readonly _idx: number;
  readonly _type: WasmValType;
  readonly _mutable: boolean;
}

export function globalRef(idx: number, type: WasmValType, mutable: boolean): GlobalRef {
  return { _tag: "global", _idx: idx, _type: type, _mutable: mutable };
}

// --- Scope handle ---

/**
 * Handle passed to `Ctrl.scope(body)` for registering deferred cleanup.
 * Call `defer(cleanup)` to schedule a generator to run (LIFO) when the scope exits.
 */
export interface ScopeHandle {
  /** Registers a cleanup generator to execute when the scope exits (LIFO order). */
  defer(cleanup: FuncGen<void>): void;
}

// --- Data segment ---

/**
 * A data segment that initializes linear memory at module load time.
 * `offset` is the byte address; `init` is the raw byte payload.
 */
export interface DataSegment {
  readonly offset: number;
  readonly init: Uint8Array;
}

// --- Module-level instructions ---

/**
 * Discriminated union of all module-level instructions.
 * Yielded by module-level primitives and processed by {@link compile}.
 */
export type ModuleInstruction =
  | {
      _type: "import_func";
      module: string;
      name: string;
      params: WasmValType[];
      results: WasmValType[];
    }
  | { _type: "func"; body: FuncBody<FuncReturn> }
  | { _type: "export"; name: string; ref: FuncRef }
  | { _type: "memory"; pages: number }
  | { _type: "global"; valType: WasmValType; init: number; mutable: boolean }
  | { _type: "data"; offset: number; init: Uint8Array }
  | { _type: "table"; funcIndices: number[] }
  | { _type: "start"; ref: FuncRef };
