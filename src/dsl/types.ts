import type { IRNode } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";

// --- Opaque references ---

/**
 * Opaque reference to a local variable or parameter slot.
 *
 * Obtained via {@link param} or {@link local}; passed to {@link get}, {@link set}, and {@link tee}.
 * The internal index is managed by the interpreter — user code should treat this as opaque.
 */
export interface WasmRef {
  readonly _tag: "ref";
  readonly _idx: number;
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
export function ref(idx: number): WasmRef {
  return { _tag: "ref", _idx: idx };
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
 * Expression type: either an already-resolved {@link WasmVal} or a lazy
 * {@link FuncGen} that produces one. Use {@link resolve} to normalize.
 */
export type Expr = WasmVal | FuncGen<WasmVal>;

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
  then_: FuncBody<WasmVal | void>;
  /** Optional body executed when the condition is falsy. */
  else_?: FuncBody<WasmVal | void>;
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
  | { _type: "func"; body: FuncBody<WasmVal | void> }
  | { _type: "export"; name: string; ref: FuncRef }
  | { _type: "memory"; pages: number };
