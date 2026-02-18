import { IR, type BinopKind, type CmpKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  WasmRef,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type ModuleGen,
  type FuncInstruction,
  type ModuleInstruction,
} from "./types";

// --- resolve helper ---

/**
 * Resolves an {@link Expr} to a concrete {@link WasmVal}.
 *
 * - `number` → `i32.const`
 * - `WasmRef` → `local_get`
 * - `WasmVal` → returned as-is
 * - `FuncGen<WasmVal>` → driven via `yield*`
 *
 * @param expr - A value, reference, number, or lazy generator expression
 * @returns The resolved `WasmVal`
 */
export function* resolve(
  expr: Expr,
): Generator<FuncInstruction, WasmVal, any> {
  if (typeof expr === "number") return val(IR.const_i32(expr));
  if (expr instanceof WasmRef) return val(IR.local_get(expr._idx));
  if ("_tag" in expr && expr._tag === "val") return expr as WasmVal;
  return yield* (expr as FuncGen<WasmVal>);
}

// --- Module-level primitives ---

/**
 * Declares an imported function from a host module.
 *
 * @param mod - The import module name (e.g. `"env"`)
 * @param name - The import field name
 * @param params - Parameter types of the imported function
 * @param results - Result types of the imported function
 * @returns A generator that yields a {@link FuncRef} to the imported function
 *
 * @example
 * ```ts
 * const log = yield* import_("env", "log", ["i32"], []);
 * ```
 */
export function import_(
  mod: string,
  name: string,
  params: WasmValType[],
  results: WasmValType[],
): ModuleGen<FuncRef> {
  return (function* () {
    const r: FuncRef = yield {
      _type: "import_func",
      module: mod,
      name,
      params,
      results,
    };
    return r;
  })();
}

/**
 * Defines a new function in the module.
 *
 * The body is a factory (`FuncBody`) invoked lazily during compilation.
 * Inside the body, use `yield*` with function-level primitives to build the function.
 *
 * @param body - Factory that produces the function body generator
 * @returns A generator that yields a {@link FuncRef} to the new function
 *
 * @example
 * ```ts
 * const add = yield* func(function* () {
 *   const a = yield* param("i32");
 *   const b = yield* param("i32");
 *   return yield* add(get(a), get(b));
 * });
 * yield* export_("add", add);
 * ```
 */
export function func(
  body: FuncBody<WasmVal | void>,
): ModuleGen<FuncRef> {
  return (function* () {
    const r: FuncRef = yield { _type: "func", body };
    return r;
  })();
}

/**
 * Exports a function under the given name, making it callable from the host.
 *
 * @param name - The export name visible to the host
 * @param funcref - Reference to the function to export
 *
 * @example
 * ```ts
 * yield* export_("main", f);
 * ```
 */
export function export_(
  name: string,
  funcref: FuncRef,
): ModuleGen<void> {
  return (function* () {
    yield { _type: "export", name, ref: funcref } as ModuleInstruction;
  })();
}

/**
 * Declares linear memory with the given initial size.
 *
 * @param pages - Number of 64 KiB pages to allocate
 */
export function memory(pages: number): ModuleGen<void> {
  return (function* () {
    yield { _type: "memory", pages } as ModuleInstruction;
  })();
}

// --- Declaration primitives (yield to interpreter for index allocation) ---

/**
 * Declares a function parameter of the given type.
 * Must appear before any other statements in a function body.
 *
 * @param type - The Wasm value type (e.g. `"i32"`, `"i64"`)
 * @returns A generator that yields a {@link WasmRef} bound to this parameter slot
 *
 * @example
 * ```ts
 * const x = yield* param("i32");
 * ```
 */
export function param(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "param", valType: type };
    return r;
  })();
}

/**
 * Declares a local variable of the given type, initialized to zero.
 *
 * @param type - The Wasm value type (e.g. `"i32"`, `"i64"`)
 * @returns A generator that yields a {@link WasmRef} bound to this local slot
 *
 * @example
 * ```ts
 * const tmp = yield* local("i32");
 * ```
 */
export function local(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "local", valType: type };
    return r;
  })();
}

// --- Expression primitives (pure — no yield, build IRNode directly) ---

/**
 * Creates an i32 constant value.
 *
 * @param v - The 32-bit integer value
 * @returns A generator producing a {@link WasmVal} for the constant
 */
export function i32(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i32(v));
  })();
}

/**
 * Creates an i64 constant value.
 *
 * @param v - The 64-bit integer value
 * @returns A generator producing a {@link WasmVal} for the constant
 */
export function i64(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i64(v));
  })();
}

/**
 * Reads the current value of a local variable or parameter.
 *
 * @param r - Reference to the local/param slot
 * @returns A generator producing a {@link WasmVal} with the slot's value
 */
export function get(r: WasmRef): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.local_get(r._idx));
  })();
}

/**
 * Factory that creates a binary operator primitive.
 * The returned function takes two {@link Expr} operands, resolves them,
 * and produces a {@link WasmVal} from the IR `binop` node.
 *
 * @param kind - The binary operation kind (e.g. `"add"`, `"sub"`)
 * @returns A binary operator function `(a: Expr, b: Expr) => FuncGen<WasmVal>`
 */
function makeBinop(kind: BinopKind): (a: Expr, b: Expr) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node));
    })();
}

/** Integer addition (`i32.add`). */
export const add = makeBinop("add");
/** Integer subtraction (`i32.sub`). */
export const sub = makeBinop("sub");
/** Integer multiplication (`i32.mul`). */
export const mul = makeBinop("mul");
/** Integer division — signed (`i32.div_s`). */
export const div = makeBinop("div");
/** Integer remainder — signed (`i32.rem_s`). */
export const rem = makeBinop("rem");
/** Bitwise AND (`i32.and`). */
export const and_ = makeBinop("and");
/** Bitwise OR (`i32.or`). */
export const or_ = makeBinop("or");
/** Bitwise XOR (`i32.xor`). */
export const xor_ = makeBinop("xor");
/** Bitwise shift left (`i32.shl`). */
export const shl = makeBinop("shl");
/** Bitwise shift right — signed (`i32.shr_s`). */
export const shr = makeBinop("shr");

/**
 * Factory that creates a comparison operator primitive.
 * The returned function takes two {@link Expr} operands, resolves them,
 * and produces a {@link WasmVal} (i32 boolean: 0 or 1).
 *
 * @param kind - The comparison kind (e.g. `"eq"`, `"lt"`)
 * @returns A comparison function `(a: Expr, b: Expr) => FuncGen<WasmVal>`
 */
function makeCmp(kind: CmpKind): (a: Expr, b: Expr) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node));
    })();
}

/** Equal (`i32.eq`). Returns i32 boolean. */
export const eq = makeCmp("eq");
/** Not equal (`i32.ne`). Returns i32 boolean. */
export const ne = makeCmp("ne");
/** Less than — signed (`i32.lt_s`). Returns i32 boolean. */
export const lt = makeCmp("lt");
/** Greater than — signed (`i32.gt_s`). Returns i32 boolean. */
export const gt = makeCmp("gt");
/** Less than or equal — signed (`i32.le_s`). Returns i32 boolean. */
export const le = makeCmp("le");
/** Greater than or equal — signed (`i32.ge_s`). Returns i32 boolean. */
export const ge = makeCmp("ge");

/**
 * Loads a 32-bit integer from linear memory.
 *
 * @param addr - Expression for the byte address
 * @returns A generator producing a {@link WasmVal} with the loaded value
 */
export function load(addr: Expr): FuncGen<WasmVal> {
  return (function* () {
    const va = yield* resolve(addr);
    return val(IR.load_i32(va._node));
  })();
}

/**
 * Calls a function and returns its result as a value.
 * Use {@link call_} for void calls (discards result).
 *
 * @param funcref - Reference to the function to call
 * @param args - Argument expressions
 * @returns A generator producing a {@link WasmVal} with the call result
 */
export function call(
  funcref: FuncRef,
  ...args: Expr[]
): FuncGen<WasmVal> {
  return (function* () {
    const resolved = [];
    for (const a of args) {
      resolved.push(yield* resolve(a));
    }
    return val(IR.call(funcref._idx, resolved.map((r) => r._node)));
  })();
}

// --- Statement primitives (yield StmtInstruction) ---

/**
 * Sets a local variable to a new value.
 *
 * @param r - Reference to the local/param slot
 * @param value - Expression for the new value
 */
export function set(r: WasmRef, value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_set(r._idx, v._node) };
  })();
}

/**
 * Sets a local variable and also returns the value (tee).
 * Equivalent to `local.tee` — useful for chaining assignments.
 *
 * @param r - Reference to the local/param slot
 * @param value - Expression for the new value
 * @returns A generator producing a {@link WasmVal} equal to the assigned value
 */
export function tee(r: WasmRef, value: Expr): FuncGen<WasmVal> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_tee(r._idx, v._node) };
    return val(IR.local_get(r._idx));
  })();
}

/**
 * Stores a 32-bit integer to linear memory.
 *
 * @param addr - Expression for the byte address
 * @param value - Expression for the value to store
 */
export function store(addr: Expr, value: Expr): FuncGen<void> {
  return (function* () {
    const va = yield* resolve(addr);
    const vv = yield* resolve(value);
    yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
  })();
}

/**
 * Calls a function as a statement (discards any return value).
 * Use {@link call} to capture the return value.
 *
 * @param funcref - Reference to the function to call
 * @param args - Argument expressions
 */
export function call_(funcref: FuncRef, ...args: Expr[]): FuncGen<void> {
  return (function* () {
    const resolved = [];
    for (const a of args) {
      resolved.push(yield* resolve(a));
    }
    yield {
      _type: "stmt",
      node: IR.call(funcref._idx, resolved.map((r) => r._node)),
    };
  })();
}

/**
 * Evaluates an expression and discards its value.
 *
 * @param value - Expression whose value to discard
 */
export function drop_(value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.drop(v._node) };
  })();
}

/**
 * Returns a value from the current function.
 *
 * @param value - Expression for the return value
 */
export function return_(value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.return_(v._node) };
  })();
}

/**
 * Unconditional branch to the enclosing block/loop at the given depth.
 * For `loop`: jumps back to the loop header. For `block`: breaks out.
 *
 * @param depth - Number of enclosing scopes to break out of (0 = innermost)
 */
export function br(depth: number): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.br(depth) };
  })();
}

/**
 * Conditional branch — branches if the condition is non-zero.
 *
 * @param depth - Number of enclosing scopes to break out of (0 = innermost)
 * @param cond - Condition expression (i32 boolean)
 */
export function br_if(depth: number, cond: Expr): FuncGen<void> {
  return (function* () {
    const vc = yield* resolve(cond);
    yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
  })();
}

/** Emits a no-op instruction. */
export function nop_(): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.nop() };
  })();
}

/**
 * Emits a side-effect instruction (e.g. for host interaction).
 *
 * @param tag - Numeric tag identifying the effect kind
 * @param payload - Expression for the payload value
 */
export function effect(tag: number, payload: Expr): FuncGen<void> {
  return (function* () {
    const vp = yield* resolve(payload);
    yield { _type: "stmt", node: IR.effect(tag, vp._node) };
  })();
}

// --- Control flow primitives (yield compound instructions) ---

/**
 * Conditional execution (`if`/`else`).
 *
 * Both branches are `FuncBody` factories for deferred interpretation.
 * If both branches return a {@link WasmVal}, the `if_` itself produces a value.
 *
 * @param cond - Condition expression (i32 boolean)
 * @param then_ - Body executed when condition is truthy
 * @param else_ - Optional body executed when condition is falsy
 *
 * @example
 * ```ts
 * const result = yield* if_(
 *   gt(get(x), i32(0)),
 *   function* () { return yield* i32(1); },
 *   function* () { return yield* i32(0); },
 * );
 * ```
 */
export function if_(
  cond: Expr,
  then_: FuncBody<WasmVal | void>,
  else_?: FuncBody<WasmVal | void>,
): FuncGen<any> {
  return (function* () {
    const vc = yield* resolve(cond);
    const result: WasmVal | void = yield {
      _type: "if",
      cond: vc._node,
      then_,
      else_,
    };
    return result;
  })();
}

/**
 * Wasm `loop` block. The body is re-entered when `br(0)` is executed.
 *
 * @param body - Loop body factory
 *
 * @example
 * ```ts
 * yield* loop_(function* () {
 *   yield* set(i, sub(get(i), i32(1)));
 *   yield* br_if(0, gt(get(i), i32(0)));
 * });
 * ```
 */
export function loop_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "loop", body };
  })();
}

/**
 * Wasm `block`. Use `br(0)` to break out of the block early.
 *
 * @param body - Block body factory
 */
export function block_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "block", body };
  })();
}
