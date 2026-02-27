/**
 * Graph adjacency list in CSR (Compressed Sparse Row) format.
 *
 * Memory layout:
 * - vertexBase: (n+1) i32 values — edge list start position per vertex.
 *   `vertices[v]` is the index of the first edge of vertex `v` in the edge array.
 *   `vertices[n]` equals `m` (total edges).
 * - edgeBase: m i32 values — adjacent vertex indices.
 *
 * Plain function (no Generator needed for construction). Methods that
 * require locals (e.g. `forEachNeighbor`) return `FuncGen<void>`.
 *
 * @module
 */
import type { FuncGen, WasmRef, VoidStmt } from "./types";
import { type ExprInput, ChainableExpr, resolve, set } from "./expr";
import { IR } from "../wasm/ir";
import { val } from "./types";
import { Mem, Ctrl } from "./namespaces";
import { local, Type } from "./declarations";

export interface GraphHandle {
  /**
   * Returns the degree of vertex `v` (number of outgoing edges).
   * **v must be a WasmRef** (local variable) since it is read twice.
   */
  degree(v: ExprInput): ChainableExpr;
  /** Returns the start index in the edge array for vertex `v`. */
  edgeStart(v: ExprInput): ChainableExpr;
  /**
   * Returns the end index (exclusive) in the edge array for vertex `v`.
   * Computes `vertices[v + 1]`.
   */
  edgeEnd(v: ExprInput): ChainableExpr;
  /** Loads the adjacent vertex at edge index `idx`. */
  edge(idx: ExprInput): ChainableExpr;
  /**
   * Iterates over all neighbors of vertex `v`.
   * The body callback receives:
   * - `neighbor`: WasmRef holding the adjacent vertex index (safe to use multiple times)
   * - `edgeIdx`: the edge array index (WasmRef, usable to look up edge weights)
   *
   * Internally declares loop variable, neighbor local, and start/end locals.
   */
  forEachNeighbor(
    v: ExprInput,
    body: (neighbor: WasmRef<"i32">, edgeIdx: WasmRef<"i32">) => VoidStmt[],
  ): FuncGen<void>;
}

/**
 * Creates a CSR graph accessor backed by linear memory.
 *
 * @param vertexBase - Byte offset for the vertex array (n+1 i32 values)
 * @param edgeBase - Byte offset for the edge array (m i32 values)
 */
export function Graph(vertexBase: ExprInput, edgeBase: ExprInput): GraphHandle {
  const vertices = Mem.i32Array(vertexBase);
  const edges = Mem.i32Array(edgeBase);

  // Helper: resolves v and computes v+1 as a single ChainableExpr
  function vPlus1(v: ExprInput): ChainableExpr {
    return new ChainableExpr(
      (function* () {
        const vv = yield* resolve(v);
        return val(IR.binop("add", vv._node, IR.const_i32(1)));
      })(),
    );
  }

  return {
    degree(v: ExprInput): ChainableExpr {
      // degree = vertices[v+1] - vertices[v]
      // v is resolved twice — use a WasmRef to avoid single-use issues
      return vertices.load(vPlus1(v)).sub(vertices.load(v));
    },

    edgeStart(v: ExprInput): ChainableExpr {
      return vertices.load(v);
    },

    edgeEnd(v: ExprInput): ChainableExpr {
      return vertices.load(vPlus1(v));
    },

    edge(idx: ExprInput): ChainableExpr {
      return edges.load(idx);
    },

    forEachNeighbor(
      v: ExprInput,
      body: (neighbor: WasmRef<"i32">, edgeIdx: WasmRef<"i32">) => VoidStmt[],
    ): FuncGen<void> {
      return (function* () {
        // Capture v into a local to avoid single-use issues
        const vLocal: WasmRef<"i32"> = yield* local(Type.i32);
        yield* set(vLocal, v);
        const start_: WasmRef<"i32"> = yield* local(Type.i32);
        const end_: WasmRef<"i32"> = yield* local(Type.i32);
        const ei: WasmRef<"i32"> = yield* local(Type.i32);
        const neighborLocal: WasmRef<"i32"> = yield* local(Type.i32);
        yield* set(start_, vertices.load(vLocal));
        yield* set(end_, vertices.load(vLocal.add(1)));
        yield* Ctrl.for(ei, start_, ei.lt(end_), ei.add(1), function* () {
          yield* set(neighborLocal, edges.load(ei));
          for (const stmt of body(neighborLocal, ei)) {
            yield* stmt;
          }
        });
      })();
    },
  };
}
