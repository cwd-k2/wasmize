/**
 * Three-phase module interpreter: the core compilation engine.
 *
 * Drives a `WasmProgram` generator through three phases:
 * 1. **Declaration collection** — iterates the top-level generator to gather
 *    imports, function bodies, exports, globals, data segments, and tables.
 * 2. **Body interpretation** — runs each function body generator, converting
 *    `yield*` instructions into an IR tree (declarations → local indices,
 *    statements → IRNode, control flow → nested sub-body interpretation).
 * 3. **Optimization & emission** — applies optimizer passes, validates
 *    feature targets, and delegates to `buildModule()` for binary encoding.
 *
 * @module
 */
import type { IRNode } from "../wasm/ir";
import { IR } from "../wasm/ir";
import type { WasmValType } from "../wasm/opcodes";
import type {
  FuncDef,
  ImportDef,
  ExportDef,
  GlobalDef,
  DataSegment,
  TableDef,
  ElementDef,
} from "../wasm/module";
import { buildModule } from "../wasm/module";
import { optimizeFunc, type OptimizerConfig } from "../wasm/optimize";
import {
  validateFeatures,
  describeFeature,
  suggestTarget,
  type FeatureSet,
} from "../wasm/capabilities";
import type { WasmBinary } from "./types";
import { DiagnosticCollector, type Diagnostic, type DiagnosticOptions } from "./diagnostics";
import { type BumpAllocator, checkRegionOverlaps } from "./allocator";
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
// Infers the Wasm value type of an IR node for determining function return
// types and if-expression block types. Falls back to "i32" for unknown nodes.

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

/** V-05: Validates br depth within nesting level. V-06: Validates local variable indices. */
function validateIRNode(node: IRNode, nestingLevel: number, ctx: FuncContext): void {
  switch (node.op) {
    case "br":
      if (node.depth >= nestingLevel) {
        throw new Error(
          `br depth ${node.depth} exceeds block nesting level ${nestingLevel}`,
        );
      }
      break;
    case "br_if":
      if (node.depth >= nestingLevel) {
        throw new Error(
          `br depth ${node.depth} exceeds block nesting level ${nestingLevel}`,
        );
      }
      break;
    case "br_table":
      for (const label of node.labels) {
        if (label >= nestingLevel) {
          throw new Error(
            `br depth ${label} exceeds block nesting level ${nestingLevel}`,
          );
        }
      }
      if (node.default_ >= nestingLevel) {
        throw new Error(
          `br depth ${node.default_} exceeds block nesting level ${nestingLevel}`,
        );
      }
      break;
    case "local_get":
    case "local_set":
    case "local_tee": {
      const maxIdx = ctx.paramCount + ctx.localCount;
      if (node.i >= maxIdx) {
        throw new Error(
          `Local index ${node.i} out of range (${maxIdx} locals declared)`,
        );
      }
      break;
    }
  }
}

function interpretSubBody(
  body: FuncBody<FuncReturn>,
  ctx: FuncContext,
  nestingLevel = 0,
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
        validateIRNode(instr.node, nestingLevel, ctx);
        nodes.push(instr.node);
        next = gen.next();
        break;
      }
      case "if": {
        const thenResult = interpretSubBody(instr.then_, ctx, nestingLevel + 1);
        const hasElse = instr.else_ != null;
        const elseResult = hasElse
          ? interpretSubBody(instr.else_!, ctx, nestingLevel + 1)
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
        const loopResult = interpretSubBody(instr.body as FuncBody<FuncReturn>, ctx, nestingLevel + 1);
        nodes.push(IR.loop(loopResult.nodes));
        next = gen.next();
        break;
      }
      case "block": {
        const blockResult = interpretSubBody(instr.body as FuncBody<FuncReturn>, ctx, nestingLevel + 1);
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
  diagnosticCollector?: DiagnosticCollector,
) {
  const gen = program();
  const imports: ImportDef[] = [];
  const bodies: FuncBody<FuncReturn>[] = [];
  const declaredResultsPerFunc: (WasmValType[] | undefined)[] = [];
  const exports_: ExportDef[] = [];
  const globals: GlobalDef[] = [];
  const dataSegments: DataSegment[] = [];
  const tables: TableDef[] = [];
  const elementsArr: ElementDef[] = [];
  let memoryPages = 1;
  let memoryDeclared = false;
  let funcIdx = 0;
  let startFuncIdx: number | undefined;
  const exportNames = new Set<string>();

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
        declaredResultsPerFunc.push(instr.declaredResults);
        const fr: FuncRef = funcRef(funcIdx++);
        next = gen.next(fr);
        break;
      }
      case "export": {
        if (exportNames.has(instr.name)) {
          throw new Error(`Duplicate export name: '${instr.name}'`);
        }
        exportNames.add(instr.name);
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
        memoryDeclared = true;
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
      case "start": {
        startFuncIdx = instr.ref._idx;
        next = gen.next();
        break;
      }
    }
  }

  // V-07: Data segment overlap detection (boundary check is in V-01, after Phase 2)
  if (diagnosticCollector) {
    for (let i = 0; i < dataSegments.length; i++) {
      const a = dataSegments[i]!;
      const aEnd = a.offset + a.init.length;
      for (let j = i + 1; j < dataSegments.length; j++) {
        const b = dataSegments[j]!;
        const bEnd = b.offset + b.init.length;
        if (a.offset < bEnd && b.offset < aEnd) {
          diagnosticCollector.add({
            level: "warning",
            code: "V-07",
            message: `Data segments overlap: [${a.offset}, ${aEnd}) and [${b.offset}, ${bEnd})`,
          });
        }
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

  // V-10: Function return type consistency check
  for (let fi = 0; fi < funcs.length; fi++) {
    const declared = declaredResultsPerFunc[fi];
    if (!declared) continue;
    const actual = funcs[fi]!.results;
    const declStr = declared.length === 0 ? "void" : declared.join(", ");
    const actStr = actual.length === 0 ? "void" : actual.join(", ");
    if (declStr !== actStr) {
      const msg = `Function return type mismatch: declared ${declStr} but body returns ${actStr}`;
      if (diagnosticCollector) {
        diagnosticCollector.add({ level: "error", code: "V-10", message: msg });
      } else {
        throw new Error(msg);
      }
    }
  }

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
    startFuncIdx,
  };

  return { funcs, moduleOptions, memoryDeclared };
}

/**
 * Compiles a generator-based DSL program into a Wasm binary.
 *
 * Drives the program generator through declaration collection, body
 * interpretation, IR optimization, and binary encoding.
 *
 * @typeParam T - Export function signatures. The returned `WasmBinary<T>`
 *   carries this as a phantom type for use with `instantiate()`.
 * @param program - Generator factory that yields module-level instructions.
 * @param options.optimize - Enable IR optimization (default: `true`).
 * @param options.optimizerConfig - Custom optimizer passes and iterations.
 * @param options.target - Required Wasm feature set. Throws if the compiled
 *   IR uses features not in the target.
 * @returns Wasm binary as `Uint8Array` with phantom type `T`.
 *
 * @example
 * ```ts
 * const bin = compile<{ add(a: number, b: number): number }>(function* () {
 *   yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
 *     return a.add(b);
 *   });
 * });
 * const { exports } = await instantiate(bin);
 * exports.add(1, 2); // 3
 * ```
 */
/** Options for `compile()`. */
export interface CompileOptions extends DiagnosticOptions {
  optimize?: boolean;
  optimizerConfig?: OptimizerConfig;
  target?: FeatureSet;
  /** BumpAllocator(s) to validate against declared memory pages. */
  allocator?: BumpAllocator | BumpAllocator[];
}

/** Result of `compileWithDiagnostics()`. */
export interface DiagnosticResult<T> {
  binary?: WasmBinary<T>;
  diagnostics: Diagnostic[];
}

export function compile<T = Record<string, unknown>>(
  program: WasmProgram,
  options?: CompileOptions,
): WasmBinary<T> {
  const collector = options?.diagnostics
    ? new DiagnosticCollector({ strict: options?.strict, warnings: options?.warnings })
    : undefined;

  const { funcs, moduleOptions, memoryDeclared } = collectAndInterpret(
    program,
    options?.optimize !== false,
    options?.optimizerConfig,
    collector,
  );

  // V-01: Memory budget validation
  if (options?.allocator) {
    const allocators = Array.isArray(options.allocator) ? options.allocator : [options.allocator];
    const maxRequired = Math.max(...allocators.map((a) => a.requiredPages));

    if (!memoryDeclared) {
      // Auto-adopt allocator's requiredPages when Mod.memory() is omitted
      moduleOptions.memoryPages = maxRequired;
    } else if (maxRequired > moduleOptions.memoryPages) {
      const msg = `Memory budget exceeded: allocations require ${maxRequired} pages but only ${moduleOptions.memoryPages} pages declared`;
      if (collector) {
        collector.add({ level: "error", code: "V-01", message: msg });
      } else {
        throw new Error(msg);
      }
    }
  }

  // V-08: Allocator region overlap detection
  if (options?.allocator) {
    const allocators = Array.isArray(options.allocator) ? options.allocator : [options.allocator];
    const overlaps = checkRegionOverlaps(allocators);
    for (const msg of overlaps) {
      if (collector) {
        collector.add({ level: "error", code: "V-08", message: msg });
      } else {
        throw new Error(msg);
      }
    }
  }

  // V-01: Data segment bounds validation
  {
    const maxBytes = moduleOptions.memoryPages * 65536;
    for (const seg of moduleOptions.dataSegments ?? []) {
      if (seg.offset + seg.init.length > maxBytes) {
        const msg = `Data segment out of bounds: offset ${seg.offset} + ${seg.init.length} bytes exceeds ${moduleOptions.memoryPages} pages (${maxBytes} bytes)`;
        if (collector) {
          collector.add({ level: "error", code: "V-01", message: msg });
        } else {
          throw new Error(msg);
        }
      }
    }
  }

  if (options?.target) {
    const result = validateFeatures(funcs, options.target);
    if (!result.valid) {
      const details = result.missing.map((f) => `  - ${f}: ${describeFeature(f)}`).join("\n");
      const suggestion = suggestTarget(funcs);
      const msg = `Target does not support required features:\n${details}\nSuggested target: Features.${suggestion.name}`;
      if (collector) {
        collector.add({ level: "error", code: "W-TARGET", message: msg });
      } else {
        throw new Error(msg);
      }
    }
  }

  if (collector?.hasErrors) {
    throw new Error(collector.errors[0]!.message);
  }

  return buildModule(funcs, moduleOptions) as WasmBinary<T>;
}

/**
 * Compiles a program and returns diagnostics instead of throwing.
 *
 * If compilation succeeds (no errors), `binary` is set.
 * If errors are present, `binary` is undefined.
 */
export function compileWithDiagnostics<T = Record<string, unknown>>(
  program: WasmProgram,
  options?: Omit<CompileOptions, "diagnostics">,
): DiagnosticResult<T> {
  const collector = new DiagnosticCollector({
    strict: options?.strict,
    warnings: options?.warnings,
  });

  let funcs: FuncDef[];
  let moduleOptions: ReturnType<typeof collectAndInterpret>["moduleOptions"];

  let memoryDeclared = false;

  try {
    const result = collectAndInterpret(
      program,
      options?.optimize !== false,
      options?.optimizerConfig,
      collector,
    );
    funcs = result.funcs;
    moduleOptions = result.moduleOptions;
    memoryDeclared = result.memoryDeclared;
  } catch (e) {
    collector.add({
      level: "error",
      code: "COMPILE",
      message: e instanceof Error ? e.message : String(e),
    });
    return { diagnostics: [...collector.all] };
  }

  // V-01: Memory budget validation
  if (options?.allocator) {
    const allocators = Array.isArray(options.allocator) ? options.allocator : [options.allocator];
    const maxRequired = Math.max(...allocators.map((a) => a.requiredPages));

    if (!memoryDeclared) {
      moduleOptions.memoryPages = maxRequired;
    } else if (maxRequired > moduleOptions.memoryPages) {
      collector.add({
        level: "error",
        code: "V-01",
        message: `Memory budget exceeded: allocations require ${maxRequired} pages but only ${moduleOptions.memoryPages} pages declared`,
      });
    }
  }

  // V-08: Allocator region overlap detection
  if (options?.allocator) {
    const allocators = Array.isArray(options.allocator) ? options.allocator : [options.allocator];
    const overlaps = checkRegionOverlaps(allocators);
    for (const msg of overlaps) {
      collector.add({ level: "error", code: "V-08", message: msg });
    }
  }

  // V-01: Data segment bounds validation
  {
    const maxBytes = moduleOptions.memoryPages * 65536;
    for (const seg of moduleOptions.dataSegments ?? []) {
      if (seg.offset + seg.init.length > maxBytes) {
        collector.add({
          level: "error",
          code: "V-01",
          message: `Data segment out of bounds: offset ${seg.offset} + ${seg.init.length} bytes exceeds ${moduleOptions.memoryPages} pages (${maxBytes} bytes)`,
        });
      }
    }
  }

  if (options?.target) {
    const result = validateFeatures(funcs, options.target);
    if (!result.valid) {
      for (const f of result.missing) {
        collector.add({
          level: "error",
          code: "W-TARGET",
          message: `Unsupported feature: ${f} — ${describeFeature(f)}`,
        });
      }
    }
  }

  if (collector.hasErrors) {
    return { diagnostics: [...collector.all] };
  }

  const binary = buildModule(funcs, moduleOptions) as WasmBinary<T>;
  return { binary, diagnostics: [...collector.all] };
}

/**
 * Compiles a program to IR without emitting binary.
 * Returns function definitions and module options for WAT generation or inspection.
 */
export function compileToIR(
  program: WasmProgram,
  options?: { optimize?: boolean; optimizerConfig?: OptimizerConfig },
) {
  return collectAndInterpret(program, options?.optimize !== false, options?.optimizerConfig);
}
