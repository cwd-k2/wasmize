/**
 * Public API entry point.
 *
 * Re-exports the DSL (compile, namespaces, primitives), data structures
 * (Struct, Str, BumpAllocator), high-level APIs (wasmFunc, wasmize),
 * and runtime utilities (instantiate, marshal).
 *
 * @module
 */
// Side-effect: WasmRef prototype augmentation (must be first)
import "./dsl/augment";

// Core DSL (re-export from compiler barrel)
export {
  compile,
  compileWithDiagnostics,
  DiagnosticCollector,
  type Diagnostic,
  type DiagnosticLevel,
  type DiagnosticOptions,
  type CompileOptions,
  type DiagnosticResult,
  param,
  local,
  locals,
  run,
  Type,
  ChainableExpr,
  ThenBuilder,
  ElseIfBuilder,
  type ExprInput,
  type CallableFunc,
  Mod,
  Op,
  Mem,
  Ctrl,
  Loc,
  Tuple,
  i32,
  i64,
  f32,
  f64,
  Meta,
  RGBA,
  Queue,
  Stack,
  RingBuffer,
  BitSet,
  MinHeap,
  MaxHeap,
  HashMap,
  UnionFind,
  Deque,
  HashSet,
  Graph,
  SortedArray,
  SegmentTree,
  LRUCache,
  WasmRef,
  type WasmBinary,
  type WasmVal,
  type FuncRef,
  type Expr,
  type FuncGen,
  type FuncBody,
  type VoidBody,
  type VoidStmt,
  type ModuleGen,
  type WasmProgram,
  intercept,
  interceptIR,
  withTrace,
  interceptModule,
  composeIntercepts,
  interceptFilter,
  interceptWhen,
  type TraceEntry,
} from "./dsl/compiler";

// Data structures
export { Struct, FieldAccessor, type FieldType, type FieldSpec, type StructType, type StructArray } from "./dsl/struct";
export { Str } from "./dsl/string";
export { BumpAllocator } from "./dsl/allocator";

// Instrumentation
export { createProfile, withProfiling, type InstructionProfile } from "./dsl/instrument";
export { withBoundsCheck } from "./dsl/guard";

// High-level APIs
export { wasmFunc } from "./inline";
export { wasmize } from "./declarative";

// Runtime utilities
export { instantiate, instantiateFromUrl, instantiateFromResponse, type InstantiateResult } from "./runtime/instantiate";
export {
  writeI32Array,
  readI32Array,
  writeF64Array,
  readF64Array,
  writeString,
  readString,
  roundtrip,
} from "./runtime/marshal";
export { fuzz, Gen, type InputGenerator, type FuzzOptions, type FuzzResult, type FuzzFailure } from "./runtime/fuzz";
export { saveBenchmark, loadBenchmark, compareBenchmarks, type BenchmarkResult } from "./runtime/bench-history";
export { writeImageData, readImageData, syncCanvas } from "./runtime/canvas";
export { rgbToHex, hexToRgb, lerpColor } from "./runtime/color";
export { dumpMemory, snapshotMemory, diffMemory, formatDiff, type MemoryDiff } from "./runtime/debug-utils";
export { assertNoTraps, assertTraps, getLastAssertionError } from "./runtime/assertions";
export { buildCSR, buildWeightedCSR, buildUndirectedCSR, writeCSR, type CSRData } from "./runtime/graph-marshal";
export { mockImports } from "./runtime/mock";

// Tooling
export { buildCallGraph, findRecursion, findUnusedFunctions } from "./wasm/call-graph";
export { detectDeadCode, formatDeadCode, type DeadCodeEntry } from "./wasm/dead-code";
export { compileWithSourceMap, SourceMapCollector, buildSourceMap, type SourceMapEntry } from "./wasm/source-map";
export { compileWithReport, formatReport } from "./wasm/optimizer-report";
