import type { IRNode } from "../wasm/ir";
import { IR } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import type { FuncDef, ImportDef, ExportDef } from "../wasm/module";
import { buildModule } from "../wasm/module";
import {
  ref,
  funcRef,
  type WasmVal,
  type FuncRef,
  type FuncBody,
  type FuncInstruction,
  type WasmProgram,
} from "./types";

// --- Function body interpreter ---

interface FuncContext {
  params: WasmValType[];
  locals: WasmValType[];
  paramCount: number;
  localCount: number;
}

function isVal(v: unknown): v is WasmVal {
  return v != null && typeof v === "object" && (v as WasmVal)._tag === "val";
}

function interpretSubBody(
  body: FuncBody<WasmVal | void>,
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
          next = gen.next(ref(idx));
        } else {
          const idx = ctx.paramCount + ctx.localCount++;
          ctx.locals.push(instr.valType);
          next = gen.next(ref(idx));
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
          const ifNode = IR.if_then_else(instr.cond, thenNodes, elseNodes, "i32");
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
        const loopResult = interpretSubBody(instr.body as FuncBody<WasmVal | void>, ctx);
        nodes.push(IR.loop(loopResult.nodes));
        next = gen.next();
        break;
      }
      case "block": {
        const blockResult = interpretSubBody(instr.body as FuncBody<WasmVal | void>, ctx);
        nodes.push(IR.block(blockResult.nodes));
        next = gen.next();
        break;
      }
    }
  }

  return { nodes, result: next.value };
}

// --- Module interpreter ---

export function compile(program: WasmProgram): Uint8Array {
  const gen = program();
  const imports: ImportDef[] = [];
  const bodies: FuncBody<WasmVal | void>[] = [];
  const exports_: ExportDef[] = [];
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
      case "memory": {
        memoryPages = instr.pages;
        next = gen.next();
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
      results: isVal(result) ? ["i32" as WasmValType] : [],
      locals: ctx.locals,
      body: bodyNodes,
    };
  });

  // Phase 3: build binary via existing module builder
  return buildModule(funcs, {
    imports,
    memoryPages,
    exports: exports_,
  });
}
