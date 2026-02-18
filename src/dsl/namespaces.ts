import { IR } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  type WasmRef,
  type FuncRef,
  type FuncGen,
  type FuncBody,
  type ModuleGen,
  type WasmVal,
  type ModuleInstruction,
} from "./types";
import {
  type ExprInput,
  type CallableFunc,
  ChainableExpr,
  IfBuilder,
  resolve,
  callableFunc,
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

/** Module-level declarations: functions, exports, imports, memory. */
export const Mod = {
  /** Defines a new function in the module. */
  func(body: FuncBody<WasmVal | void>): ModuleGen<CallableFunc> {
    return (function* () {
      const r: FuncRef = yield { _type: "func", body };
      return callableFunc(r._idx);
    })();
  },
  /** Exports a function under the given name. */
  export(name: string, funcref: FuncRef): ModuleGen<void> {
    return (function* () {
      yield { _type: "export", name, ref: funcref } as ModuleInstruction;
    })();
  },
  /** Declares an imported function from a host module. */
  import(
    moduleName: string,
    name: string,
    params: WasmValType[],
    results: WasmValType[],
  ): ModuleGen<CallableFunc> {
    return (function* () {
      const r: FuncRef = yield {
        _type: "import_func",
        module: moduleName,
        name,
        params,
        results,
      };
      return callableFunc(r._idx);
    })();
  },
  /** Declares linear memory with the given initial size. */
  memory(pages: number): ModuleGen<void> {
    return (function* () {
      yield { _type: "memory", pages } as ModuleInstruction;
    })();
  },
};

/** Arithmetic, comparison, and bitwise operations. */
export const Op = {
  /** Integer addition (`i32.add`). */
  add,
  /** Integer subtraction (`i32.sub`). */
  sub,
  /** Integer multiplication (`i32.mul`). */
  mul,
  /** Integer division — signed (`i32.div_s`). */
  div,
  /** Integer remainder — signed (`i32.rem_s`). */
  rem,
  /** Equal (`i32.eq`). */
  eq,
  /** Not equal (`i32.ne`). */
  ne,
  /** Less than — signed (`i32.lt_s`). */
  lt,
  /** Greater than — signed (`i32.gt_s`). */
  gt,
  /** Less than or equal — signed (`i32.le_s`). */
  le,
  /** Greater than or equal — signed (`i32.ge_s`). */
  ge,
  /** Bitwise AND (`i32.and`). */
  and: and_,
  /** Bitwise OR (`i32.or`). */
  or: or_,
  /** Bitwise XOR (`i32.xor`). */
  xor: xor_,
  /** Bitwise shift left (`i32.shl`). */
  shl,
  /** Bitwise shift right — signed (`i32.shr_s`). */
  shr,
} as const;

/** Memory and constant operations. */
export const Mem = {
  /** Loads a 32-bit integer from linear memory. Returns {@link ChainableExpr} for chaining. */
  load(addr: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const va = yield* resolve(addr);
        return val(IR.load_i32(va._node));
      })(),
    );
  },
  /** Stores a 32-bit integer to linear memory. */
  store(addr: ExprInput, value: ExprInput): FuncGen<void> {
    return (function* () {
      const va = yield* resolve(addr);
      const vv = yield* resolve(value);
      yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
    })();
  },
  /** Creates an i32 constant value. Returns {@link ChainableExpr} for chaining. */
  i32(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i32(v));
      })(),
    );
  },
  /** Creates an i64 constant value. Returns {@link ChainableExpr} for chaining. */
  i64(v: number): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        return val(IR.const_i64(v));
      })(),
    );
  },
};

/** Control flow: branching, loops, blocks. */
export const Ctrl = {
  /**
   * Conditional execution — returns an IfBuilder for `.then()` / `.else()` chaining.
   *
   * @example
   * ```ts
   * yield* Ctrl.if(n.le(1))
   *   .then(function* () { return yield* Mem.load(n.mul(4)); })
   *   .else(function* () { ... });
   * ```
   */
  if(cond: ExprInput): IfBuilder {
    return new IfBuilder(cond);
  },
  /** Wasm `loop` block. */
  loop(body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      yield { _type: "loop", body };
    })();
  },
  /** Wasm `block`. */
  block(body: FuncBody<void>): FuncGen<void> {
    return (function* () {
      yield { _type: "block", body };
    })();
  },
  /** Unconditional branch to the enclosing block/loop at the given depth. */
  br(depth: number): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.br(depth) };
    })();
  },
  /** Conditional branch — branches if the condition is non-zero. */
  br_if(depth: number, cond: ExprInput): FuncGen<void> {
    return (function* () {
      const vc = yield* resolve(cond);
      yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
    })();
  },
  /** Emits a no-op instruction. */
  nop(): FuncGen<void> {
    return (function* () {
      yield { _type: "stmt", node: IR.nop() };
    })();
  },
  /** Emits a side-effect instruction. */
  effect(tag: number, payload: ExprInput): FuncGen<void> {
    return (function* () {
      const vp = yield* resolve(payload);
      yield { _type: "stmt", node: IR.effect(tag, vp._node) };
    })();
  },
};

/** Local variable operations. */
export const Loc = {
  /** Reads the current value of a local variable or parameter. */
  get(r: WasmRef): FuncGen<WasmVal> {
    return (function* () {
      return val(IR.local_get(r._idx));
    })();
  },
  /** Sets a local variable to a new value. */
  set,
  /** Sets a local variable and returns the value (tee). */
  tee,
  /** Evaluates an expression and discards its value. */
  drop(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.drop(v._node) };
    })();
  },
  /** Returns a value from the current function. */
  return(value: ExprInput): FuncGen<void> {
    return (function* () {
      const v = yield* resolve(value);
      yield { _type: "stmt", node: IR.return_(v._node) };
    })();
  },
};
