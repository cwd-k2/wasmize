/**
 * Graph algorithms: BFS, DFS, Dijkstra.
 *
 * These are generator-based DSL functions that compose with the Graph
 * CSR helper and data structure helpers (Queue, Stack, MinHeap).
 *
 * Usage: `yield*` inside a Mod.func body.
 *
 * @module
 */
import type { FuncGen, WasmRef } from "../dsl/types";
import type { ExprInput } from "../dsl/expr";
import { set } from "../dsl/expr";
import { Mem, Ctrl } from "../dsl/namespaces";
import { local, Type } from "../dsl/declarations";
import { Queue } from "../dsl/queue";
import { Stack } from "../dsl/stack";
import { MinHeap } from "../dsl/minheap";
import type { GraphHandle } from "../dsl/graph";

/**
 * BFS (Breadth-First Search) marking all reachable vertices from `start`.
 *
 * Memory layout:
 * - visitedBase: n i32 values — 1 if vertex is reachable, 0 otherwise (caller must zero-init)
 * - queueBase: work area for BFS queue (needs n * 4 bytes minimum)
 *
 * @param graph - Graph CSR handle
 * @param start - Starting vertex index
 * @param visitedBase - Byte offset for visited array (i32 per vertex)
 * @param queueBase - Byte offset for queue work area
 */
export function* bfs(
  graph: GraphHandle,
  start: ExprInput,
  visitedBase: ExprInput,
  queueBase: ExprInput,
): FuncGen<void> {
  const visited = Mem.i32Array(visitedBase);
  const q = yield* Queue(queueBase);
  const current: WasmRef<"i32"> = yield* local(Type.i32);

  // Mark start as visited and enqueue
  yield* visited.store(start, 1);
  yield* q.enqueue(start);

  // Process queue
  yield* Ctrl.while(q.notEmpty, function* () {
    yield* q.dequeue(current);
    yield* graph.forEachNeighbor(current, (neighbor, _edgeIdx) => [
      Ctrl.when(visited.load(neighbor).eq(0), () => [
        visited.store(neighbor, 1),
        q.enqueue(neighbor),
      ]),
    ]);
  });
}

/**
 * DFS (Depth-First Search) marking all reachable vertices from `start`.
 *
 * Memory layout:
 * - visitedBase: n i32 values — 1 if vertex is reachable, 0 otherwise (caller must zero-init)
 * - stackBase: work area for DFS stack (needs n * 4 bytes minimum)
 *
 * @param graph - Graph CSR handle
 * @param start - Starting vertex index
 * @param visitedBase - Byte offset for visited array (i32 per vertex)
 * @param stackBase - Byte offset for stack work area
 */
export function* dfs(
  graph: GraphHandle,
  start: ExprInput,
  visitedBase: ExprInput,
  stackBase: ExprInput,
): FuncGen<void> {
  const visited = Mem.i32Array(visitedBase);
  const s = yield* Stack(stackBase);
  const current: WasmRef<"i32"> = yield* local(Type.i32);

  // Push start onto stack
  yield* s.push(start);

  // Process stack
  yield* Ctrl.while(s.notEmpty, function* () {
    yield* s.pop(current);
    // Only process if not yet visited (DFS may push duplicates)
    yield* Ctrl.when(visited.load(current).eq(0), function* () {
      yield* visited.store(current, 1);
      yield* graph.forEachNeighbor(current, (neighbor, _edgeIdx) => [
        Ctrl.when(visited.load(neighbor).eq(0), () => [
          s.push(neighbor),
        ]),
      ]);
    });
  });
}

/**
 * Dijkstra's single-source shortest path algorithm.
 *
 * Memory layout:
 * - weightBase: m i32 values — edge weights (same order as CSR edge array)
 * - distBase: n i32 values — result distances (initialized to 0x7FFFFFFF internally)
 * - heapBase: work area for MinHeap (needs n * 8 bytes minimum, interleaved priority/value)
 *
 * After execution, `distBase[v]` contains the shortest distance from `start` to `v`,
 * or 0x7FFFFFFF if `v` is unreachable.
 *
 * @param graph - Graph CSR handle
 * @param weightBase - Byte offset for edge weight array (i32 per edge)
 * @param start - Starting vertex index
 * @param n - Number of vertices
 * @param distBase - Byte offset for distance result array (i32 per vertex)
 * @param heapBase - Byte offset for min-heap work area
 */
export function* dijkstra(
  graph: GraphHandle,
  weightBase: ExprInput,
  start: ExprInput,
  n: ExprInput,
  distBase: ExprInput,
  heapBase: ExprInput,
): FuncGen<void> {
  const dist = Mem.i32Array(distBase);
  const weights = Mem.i32Array(weightBase);
  const heap = yield* MinHeap(heapBase);

  const curDist: WasmRef<"i32"> = yield* local(Type.i32);
  const curVtx: WasmRef<"i32"> = yield* local(Type.i32);
  const newDist: WasmRef<"i32"> = yield* local(Type.i32);
  const i: WasmRef<"i32"> = yield* local(Type.i32);

  // Initialize all distances to INT_MAX
  yield* Ctrl.range(i, n, () => [
    dist.store(i, 0x7FFFFFFF),
  ]);

  // Set start distance to 0 and insert into heap
  yield* dist.store(start, 0);
  yield* heap.insert(0, start);

  // Process heap
  yield* Ctrl.while(heap.notEmpty, function* () {
    yield* heap.extractMin(curDist, curVtx);

    // Skip stale entries: if curDist > dist[curVtx], this is outdated
    yield* Ctrl.when(curDist.le(dist.load(curVtx)), function* () {
      // Relax each neighbor
      yield* graph.forEachNeighbor(curVtx, (neighbor, edgeIdx) => [
        // newDist = curDist + weight[edgeIdx]
        set(newDist, curDist.add(weights.load(edgeIdx))),
        // If newDist < dist[neighbor], update
        Ctrl.when(newDist.lt(dist.load(neighbor)), () => [
          dist.store(neighbor, newDist),
          heap.insert(newDist, neighbor),
        ]),
      ]);
    });
  });
}
