import type { IRNode } from "../wasm/ir";
import { IR } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import type { FuncDef, ImportDef, ExportDef, GlobalDef, DataSegment, TableDef, ElementDef } from "../wasm/module";
import { buildModule } from "../wasm/module";
import { optimizeFunc, type OptimizerConfig } from "../wasm/optimize";
import type { WasmBinary } from "./types";
import {
  ref,
  val,
  funcRef,
  globalRef,
  WasmRef,
  type WasmVal,
  type FuncRef,
  type FuncBody,
  type FuncReturn,
  type FuncInstruction,
  type WasmProgram,
} from "./types";

// --- Type inference ---

interface FuncContext {
  params: WasmValType[];
  locals: WasmValType[];
  paramCount: number;
  localCount: number;
}

function inferType(node: IRNode, ctx?: FuncContext): WasmValType {
  switch (node.op) {
    case "const_i32":
    case "load_i32":
    case "load_i32_8u":
    case "cmp":
    case "i32_wrap_i64":
    case "i32_trunc_f64_s":
    case "memory_size":
    case "memory_grow":
      return "i32";
    case "eqz":
      return "i32"; // eqz always produces i32 regardless of operand type
    case "const_i64":
    case "load_i64":
    case "i64_extend_i32_s":
      return "i64";
    case "const_f32":
      return "f32";
    case "const_f64":
    case "load_f64":
    case "f64_neg":
    case "f64_abs":
    case "f64_convert_i32_s":
      return "f64";
    case "binop":
    case "unary":
      return node.type || "i32";
    case "convert": {
      const k = node.kind;
      if (k.startsWith("i32_")) return "i32";
      if (k.startsWith("i64_")) return "i64";
      if (k.startsWith("f32_")) return "f32";
      if (k.startsWith("f64_")) return "f64";
      return "i32";
    }
    case "mem_load": {
      const k = node.kind;
      if (k.startsWith("f32")) return "f32";
      if (k.startsWith("f64")) return "f64";
      if (k.startsWith("i64")) return "i64";
      return "i32";
    }
    case "if":
      return (node.type !== "void" ? node.type : "i32") as WasmValType;
    case "select":
      return inferType(node.a, ctx);
    case "local_get":
      if (ctx) {
        const allTypes = [...ctx.params, ...ctx.locals];
        if (node.i < allTypes.length) return allTypes[node.i]!;
      }
      return "i32";
    case "local_tee":
      if (ctx) {
        const allTypes = [...ctx.params, ...ctx.locals];
        if (node.i < allTypes.length) return allTypes[node.i]!;
      }
      return "i32";
    case "global_get":
      return "i32"; // globals default to i32
    case "call":
      return "i32"; // calls default to i32 (safe fallback)
    default:
      return "i32";
  }
}

// --- Function body interpreter ---

function isVal(v: unknown): v is WasmVal {
  return v != null && typeof v === "object" && (v as WasmVal)._tag === "val";
}

/**
 * Coerces a generator return value into a WasmVal.
 * Supports: WasmVal (passthrough), WasmRef (→ local_get), number (→ i32.const).
 */
function coerceReturn(v: unknown): WasmVal | void {
  if (v == null) return undefined;
  if (isVal(v)) return v;
  if (v instanceof WasmRef) return val(IR.local_get(v._idx));
  if (typeof v === "number") return val(IR.const_i32(v));
  return undefined;
}

function interpretSubBody(
  body: FuncBody<FuncReturn>,
  ctx: FuncContext,
): { nodes: IRNode[]; result: WasmVal | void } {
  const gen = body();
  const nodes: IRNode[] = [];
  let next = gen.next();

  while (!next.done) {
    const instr = next.value as FuncInstruction;

    switch (instr._type) {
      case "decl": {
        if (instr.kind === "param") {
          const idx = ctx.paramCount++;
          ctx.params.push(instr.valType);
          next = gen.next(ref(idx, instr.valType));
        } else {
          const idx = ctx.paramCount + ctx.localCount++;
          ctx.locals.push(instr.valType);
          next = gen.next(ref(idx, instr.valType));
        }
        break;
      }
      case "stmt": {
        nodes.push(instr.node);
        next = gen.next();
        break;
      }
      case "if": {
        const thenResult = interpretSubBody(instr.then_, ctx);
        const hasElse = instr.else_ != null;
        const elseResult = hasElse
          ? interpretSubBody(instr.else_!, ctx)
          : { nodes: [] as IRNode[], result: undefined as WasmVal | void };

        const thenVal = isVal(thenResult.result) ? thenResult.result : null;
        const elseVal = isVal(elseResult.result) ? elseResult.result : null;

        if (thenVal && elseVal) {
          const thenNodes = [...thenResult.nodes, thenVal._node];
          const elseNodes = [...elseResult.nodes, elseVal._node];
          const resultType = inferType(thenVal._node, ctx);
          const ifNode = IR.if_then_else(instr.cond, thenNodes, elseNodes, resultType);
          const resultVal: WasmVal = { _tag: "val", _node: ifNode };
          next = gen.next(resultVal);
        } else {
          const thenNodes = [...thenResult.nodes];
          if (thenVal) thenNodes.push(thenVal._node);
          const elseNodes = [...elseResult.nodes];
          if (elseVal) elseNodes.push(elseVal._node);
          nodes.push(IR.if_then_else(instr.cond, thenNodes, elseNodes, "void"));
          next = gen.next();
        }
        break;
      }
      case "loop": {
        const loopResult = interpretSubBody(instr.body as FuncBody<FuncReturn>, ctx);
        nodes.push(IR.loop(loopResult.nodes));
        next = gen.next();
        break;
      }
      case "block": {
        const blockResult = interpretSubBody(instr.body as FuncBody<FuncReturn>, ctx);
        nodes.push(IR.block(blockResult.nodes));
        next = gen.next();
        break;
      }
    }
  }

  return { nodes, result: coerceReturn(next.value) };
}

// --- Module interpreter ---

/** Internal shared implementation for both compile() and compileToIR(). */
function collectAndInterpret(
  program: WasmProgram,
  shouldOptimize: boolean,
  optimizerConfig?: OptimizerConfig,
) {
  const gen = program();
  const imports: ImportDef[] = [];
  const bodies: FuncBody<FuncReturn>[] = [];
  const exports_: ExportDef[] = [];
  const globals: GlobalDef[] = [];
  const dataSegments: DataSegment[] = [];
  const tables: TableDef[] = [];
  const elementsArr: ElementDef[] = [];
  let memoryPages = 1;
  let funcIdx = 0;

  // Phase 1: collect declarations
  let next = gen.next();
  while (!next.done) {
    const instr = next.value;

    switch (instr._type) {
      case "import_func": {
        imports.push({
          module: instr.module,
          name: instr.name,
          params: instr.params,
          results: instr.results,
        });
        const fr: FuncRef = funcRef(funcIdx++);
        next = gen.next(fr);
        break;
      }
      case "func": {
        bodies.push(instr.body);
        const fr: FuncRef = funcRef(funcIdx++);
        next = gen.next(fr);
        break;
      }
      case "export": {
        exports_.push({ name: instr.name, idx: instr.ref._idx });
        next = gen.next();
        break;
      }
      case "global": {
        const idx = globals.length;
        globals.push({ type: instr.valType, mutable: instr.mutable, init: instr.init });
        const gr = globalRef(idx, instr.valType, instr.mutable);
        next = gen.next(gr);
        break;
      }
      case "memory": {
        memoryPages = instr.pages;
        next = gen.next();
        break;
      }
      case "data": {
        dataSegments.push({ offset: instr.offset, init: instr.init });
        next = gen.next();
        break;
      }
      case "table": {
        const tableIdx = tables.length;
        tables.push({ min: instr.funcIndices.length });
        elementsArr.push({ tableIdx, offset: 0, funcIndices: instr.funcIndices });
        next = gen.next(tableIdx);
        break;
      }
    }
  }

  // Phase 2: compile all function bodies
  const funcs: FuncDef[] = bodies.map((body) => {
    const ctx: FuncContext = {
      params: [],
      locals: [],
      paramCount: 0,
      localCount: 0,
    };

    const { nodes, result } = interpretSubBody(body, ctx);

    const bodyNodes = [...nodes];
    if (isVal(result)) {
      bodyNodes.push(result._node);
    }

    return {
      params: ctx.params,
      results: isVal(result) ? [inferType(result._node, ctx)] : [],
      locals: ctx.locals,
      body: bodyNodes,
    };
  });

  // Phase 2.5: optimize IR
  if (shouldOptimize) {
    for (const f of funcs) {
      f.body = optimizeFunc(f.body, optimizerConfig);
    }
  }

  const moduleOptions = {
    imports,
    memoryPages,
    exports: exports_,
    globals,
    dataSegments,
    tables,
    elements: elementsArr,
  };

  return { funcs, moduleOptions };
}

export function compile<T = Record<string, unknown>>(
  program: WasmProgram,
  options?: { optimize?: boolean; optimizerConfig?: OptimizerConfig },
): WasmBinary<T> {
  const { funcs, moduleOptions } = collectAndInterpret(
    program,
    options?.optimize !== false,
    options?.optimizerConfig,
  );
  return buildModule(funcs, moduleOptions) as WasmBinary<T>;
}

/**
 * Compiles a program to IR without emitting binary.
 * Returns function definitions and module options for WAT generation or inspection.
 */
export function compileToIR(
  program: WasmProgram,
  options?: { optimize?: boolean; optimizerConfig?: OptimizerConfig },
) {
  return collectAndInterpret(
    program,
    options?.optimize !== false,
    options?.optimizerConfig,
  );
}
