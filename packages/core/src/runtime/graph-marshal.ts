/**
 * JS-side helper for building CSR (Compressed Sparse Row) graph representation.
 *
 * Converts an edge list into two arrays suitable for writing to Wasm memory
 * and using with the `Graph(vertexBase, edgeBase)` DSL helper.
 *
 * @module
 */

export interface CSRData {
  /** (n+1) values: edge list start position per vertex. vertices[n] = total edges. */
  readonly vertexOffsets: number[];
  /** m values: adjacent vertex indices (directed edges). */
  readonly edges: number[];
  /** m values: edge weights (same order as edges). Present when built with weighted variant. */
  readonly weights?: number[];
}

/**
 * Builds a CSR representation from a list of directed edges.
 *
 * @param n - Number of vertices (0-indexed)
 * @param edges - Array of directed edges `[from, to]`
 * @returns CSR arrays ready to write into Wasm memory via `writeI32Array`
 *
 * @example
 * ```ts
 * // Triangle: 0->1, 1->2, 2->0
 * const csr = buildCSR(3, [[0,1], [1,2], [2,0]]);
 * // csr.vertexOffsets = [0, 1, 2, 3]
 * // csr.edges = [1, 2, 0]
 * ```
 */
export function buildCSR(n: number, edges: [number, number][]): CSRData {
  // Count outgoing edges per vertex
  const degree = new Array(n).fill(0) as number[];
  for (const [u] of edges) {
    degree[u]!++;
  }

  // Prefix sum to get start positions
  const vertexOffsets = new Array(n + 1) as number[];
  vertexOffsets[0] = 0;
  for (let i = 0; i < n; i++) {
    vertexOffsets[i + 1] = vertexOffsets[i]! + degree[i]!;
  }

  // Fill edge array
  const m = edges.length;
  const edgeArray = new Array(m) as number[];
  // Track current write position per vertex
  const pos = vertexOffsets.slice(0, n) as number[];
  for (const [u, v] of edges) {
    edgeArray[pos[u]!] = v;
    pos[u]!++;
  }

  return { vertexOffsets, edges: edgeArray };
}

/**
 * Builds a weighted CSR representation from a list of directed edges with weights.
 * Weights are reordered to match the CSR edge ordering.
 *
 * @param n - Number of vertices (0-indexed)
 * @param edges - Array of directed edges `[from, to, weight]`
 * @returns CSR arrays with weights aligned to CSR edge order
 */
export function buildWeightedCSR(n: number, edges: [number, number, number][]): CSRData {
  // Count outgoing edges per vertex
  const degree = new Array(n).fill(0) as number[];
  for (const [u] of edges) {
    degree[u]!++;
  }

  // Prefix sum to get start positions
  const vertexOffsets = new Array(n + 1) as number[];
  vertexOffsets[0] = 0;
  for (let i = 0; i < n; i++) {
    vertexOffsets[i + 1] = vertexOffsets[i]! + degree[i]!;
  }

  // Fill edge and weight arrays
  const m = edges.length;
  const edgeArray = new Array(m) as number[];
  const weightArray = new Array(m) as number[];
  const pos = vertexOffsets.slice(0, n) as number[];
  for (const [u, v, w] of edges) {
    const idx = pos[u]!;
    edgeArray[idx] = v;
    weightArray[idx] = w;
    pos[u]!++;
  }

  return { vertexOffsets, edges: edgeArray, weights: weightArray };
}

/**
 * Builds a CSR representation from undirected edges.
 * Each undirected edge `[u, v]` is stored as two directed edges: `u->v` and `v->u`.
 *
 * @param n - Number of vertices (0-indexed)
 * @param edges - Array of undirected edges `[u, v]`
 * @returns CSR arrays (total 2*m directed edges)
 */
export function buildUndirectedCSR(n: number, edges: [number, number][]): CSRData {
  const directed: [number, number][] = [];
  for (const [u, v] of edges) {
    directed.push([u, v], [v, u]);
  }
  return buildCSR(n, directed);
}

/**
 * Writes CSR data into Wasm memory.
 *
 * @param mem - Int32Array view of Wasm memory
 * @param vertexWordOffset - Word offset for vertex array (byteOffset / 4)
 * @param edgeWordOffset - Word offset for edge array (byteOffset / 4)
 * @param csr - CSR data from `buildCSR` or `buildUndirectedCSR`
 */
export function writeCSR(
  mem: Int32Array,
  vertexWordOffset: number,
  edgeWordOffset: number,
  csr: CSRData,
): void {
  for (let i = 0; i < csr.vertexOffsets.length; i++) {
    mem[vertexWordOffset + i] = csr.vertexOffsets[i]!;
  }
  for (let i = 0; i < csr.edges.length; i++) {
    mem[edgeWordOffset + i] = csr.edges[i]!;
  }
}
