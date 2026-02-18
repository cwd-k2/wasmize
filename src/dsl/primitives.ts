import { IR, type BinopKind, type CmpKind } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import {
  val,
  type WasmRef,
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

export function* resolve(
  expr: Expr,
): Generator<FuncInstruction, WasmVal, any> {
  if ("_tag" in expr && expr._tag === "val") return expr;
  return yield* (expr as FuncGen<WasmVal>);
}

// --- Module-level primitives ---

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

export function func(
  body: FuncBody<WasmVal | void>,
): ModuleGen<FuncRef> {
  return (function* () {
    const r: FuncRef = yield { _type: "func", body };
    return r;
  })();
}

export function export_(
  name: string,
  funcref: FuncRef,
): ModuleGen<void> {
  return (function* () {
    yield { _type: "export", name, ref: funcref } as ModuleInstruction;
  })();
}

export function memory(pages: number): ModuleGen<void> {
  return (function* () {
    yield { _type: "memory", pages } as ModuleInstruction;
  })();
}

// --- Declaration primitives (yield to interpreter for index allocation) ---

export function param(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "param", valType: type };
    return r;
  })();
}

export function local(type: WasmValType): FuncGen<WasmRef> {
  return (function* () {
    const r: WasmRef = yield { _type: "decl", kind: "local", valType: type };
    return r;
  })();
}

// --- Expression primitives (pure — no yield, build IRNode directly) ---

export function i32(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i32(v));
  })();
}

export function i64(v: number): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.const_i64(v));
  })();
}

export function get(r: WasmRef): FuncGen<WasmVal> {
  return (function* () {
    return val(IR.local_get(r._idx));
  })();
}

function makeBinop(kind: BinopKind): (a: Expr, b: Expr) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.binop(kind, va._node, vb._node));
    })();
}

export const add = makeBinop("add");
export const sub = makeBinop("sub");
export const mul = makeBinop("mul");
export const div = makeBinop("div");
export const rem = makeBinop("rem");
export const and_ = makeBinop("and");
export const or_ = makeBinop("or");
export const xor_ = makeBinop("xor");
export const shl = makeBinop("shl");
export const shr = makeBinop("shr");

function makeCmp(kind: CmpKind): (a: Expr, b: Expr) => FuncGen<WasmVal> {
  return (a, b) =>
    (function* () {
      const va = yield* resolve(a);
      const vb = yield* resolve(b);
      return val(IR.cmp(kind, va._node, vb._node));
    })();
}

export const eq = makeCmp("eq");
export const ne = makeCmp("ne");
export const lt = makeCmp("lt");
export const gt = makeCmp("gt");
export const le = makeCmp("le");
export const ge = makeCmp("ge");

export function load(addr: Expr): FuncGen<WasmVal> {
  return (function* () {
    const va = yield* resolve(addr);
    return val(IR.load_i32(va._node));
  })();
}

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

export function set(r: WasmRef, value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_set(r._idx, v._node) };
  })();
}

export function tee(r: WasmRef, value: Expr): FuncGen<WasmVal> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.local_tee(r._idx, v._node) };
    return val(IR.local_get(r._idx));
  })();
}

export function store(addr: Expr, value: Expr): FuncGen<void> {
  return (function* () {
    const va = yield* resolve(addr);
    const vv = yield* resolve(value);
    yield { _type: "stmt", node: IR.store_i32(va._node, vv._node) };
  })();
}

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

export function drop_(value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.drop(v._node) };
  })();
}

export function return_(value: Expr): FuncGen<void> {
  return (function* () {
    const v = yield* resolve(value);
    yield { _type: "stmt", node: IR.return_(v._node) };
  })();
}

export function br(depth: number): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.br(depth) };
  })();
}

export function br_if(depth: number, cond: Expr): FuncGen<void> {
  return (function* () {
    const vc = yield* resolve(cond);
    yield { _type: "stmt", node: IR.br_if(depth, vc._node) };
  })();
}

export function nop_(): FuncGen<void> {
  return (function* () {
    yield { _type: "stmt", node: IR.nop() };
  })();
}

export function effect(tag: number, payload: Expr): FuncGen<void> {
  return (function* () {
    const vp = yield* resolve(payload);
    yield { _type: "stmt", node: IR.effect(tag, vp._node) };
  })();
}

// --- Control flow primitives (yield compound instructions) ---

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

export function loop_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "loop", body };
  })();
}

export function block_(body: FuncBody<void>): FuncGen<void> {
  return (function* () {
    yield { _type: "block", body };
  })();
}
