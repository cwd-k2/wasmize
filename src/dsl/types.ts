import type { IRNode } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";

// --- Opaque references ---

export interface WasmRef {
  readonly _tag: "ref";
  readonly _idx: number;
}

export interface WasmVal {
  readonly _tag: "val";
  readonly _node: IRNode;
}

export interface FuncRef {
  readonly _tag: "func";
  readonly _idx: number;
}

export function ref(idx: number): WasmRef {
  return { _tag: "ref", _idx: idx };
}

export function val(node: IRNode): WasmVal {
  return { _tag: "val", _node: node };
}

export function funcRef(idx: number): FuncRef {
  return { _tag: "func", _idx: idx };
}

// --- Generator types ---

// Primitives return these directly (generators, for yield*)
export type FuncGen<T> = Generator<FuncInstruction, T, any>;
export type ModuleGen<T> = Generator<ModuleInstruction, T, any>;

// Bodies passed to control flow / func (factories, for deferred invocation)
export type FuncBody<T> = () => Generator<FuncInstruction, T, any>;

// Top-level program (factory)
export type WasmProgram = () => Generator<ModuleInstruction, void, any>;

// --- Expr: resolved value or lazy generator ---

export type Expr = WasmVal | FuncGen<WasmVal>;

// --- Function-level instructions ---

export interface DeclInstruction {
  _type: "decl";
  kind: "param" | "local";
  valType: WasmValType;
}

export interface StmtInstruction {
  _type: "stmt";
  node: IRNode;
}

export interface IfInstruction {
  _type: "if";
  cond: IRNode;
  then_: FuncBody<WasmVal | void>;
  else_?: FuncBody<WasmVal | void>;
}

export interface LoopInstruction {
  _type: "loop";
  body: FuncBody<void>;
}

export interface BlockInstruction {
  _type: "block";
  body: FuncBody<void>;
}

export type FuncInstruction =
  | DeclInstruction
  | StmtInstruction
  | IfInstruction
  | LoopInstruction
  | BlockInstruction;

// --- Module-level instructions ---

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
