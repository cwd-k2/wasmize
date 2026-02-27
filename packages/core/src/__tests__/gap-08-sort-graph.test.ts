import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Mod, Mem, Ctrl, Type } from "../dsl/primitives";
import { local } from "../dsl/declarations";
import { instantiate } from "../runtime/instantiate";
import { writeI32Array } from "../runtime/marshal";
import { mergeSort } from "../stdlib/sort";
import { Graph } from "../dsl/graph";
import { buildCSR, buildUndirectedCSR, buildWeightedCSR, writeCSR } from "../runtime/graph-marshal";
import { bfs, dfs, dijkstra } from "../stdlib/graph-algo";

// ============================================================
// S-04: Merge Sort
// ============================================================
describe("S-04: mergeSort", () => {
  function makeMergeSortModule() {
    return compile(function* () {
      yield* Mod.memory(1);
      const sort = yield* Mod.use(mergeSort);

      // mergeSort(base, len, tmpBase)
      // We place the array at byte 0 (base=0), tmp at byte 1024
      yield* Mod.exportFunc(
        "sort",
        { len: Type.i32 },
        function* (len) {
          yield* sort.void(0, len, 1024);
        },
      );

      yield* Mod.exportFunc("read", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array().load(idx);
      });

      yield* Mod.exportFunc(
        "write",
        { idx: Type.i32, val: Type.i32 },
        function* (idx, val) {
          yield* Mem.i32Array().store(idx, val);
        },
      );
    });
  }

  test("sorts [5,3,1,4,2] -> [1,2,3,4,5]", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    [5, 3, 1, 4, 2].forEach((v, i) => write(i, v));
    sort(5);
    expect(Array.from({ length: 5 }, (_, i) => read(i))).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles already sorted array", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    [1, 2, 3, 4, 5].forEach((v, i) => write(i, v));
    sort(5);
    expect(Array.from({ length: 5 }, (_, i) => read(i))).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles reverse sorted array", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    [5, 4, 3, 2, 1].forEach((v, i) => write(i, v));
    sort(5);
    expect(Array.from({ length: 5 }, (_, i) => read(i))).toEqual([1, 2, 3, 4, 5]);
  });

  test("handles duplicates", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    [3, 1, 4, 1, 5, 9, 2, 6, 5, 3].forEach((v, i) => write(i, v));
    sort(10);
    expect(Array.from({ length: 10 }, (_, i) => read(i))).toEqual([1, 1, 2, 3, 3, 4, 5, 5, 6, 9]);
  });

  test("handles single element", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;
    const read = exports.read as Function;
    const write = exports.write as Function;

    write(0, 42);
    sort(1);
    expect(read(0)).toBe(42);
  });

  test("handles empty array (len=0)", async () => {
    const binary = makeMergeSortModule();
    const { exports } = await instantiate(binary);
    const sort = exports.sort as Function;

    // Should not crash
    sort(0);
  });
});

// ============================================================
// S-25: Graph Adjacency List (CSR format)
// ============================================================
describe("S-25: Graph CSR", () => {
  test("buildCSR creates correct CSR from directed edges", () => {
    // Triangle: 0->1, 1->2, 2->0
    const csr = buildCSR(3, [[0, 1], [1, 2], [2, 0]]);
    expect(csr.vertexOffsets).toEqual([0, 1, 2, 3]);
    expect(csr.edges).toEqual([1, 2, 0]);
  });

  test("buildUndirectedCSR doubles edges", () => {
    // Single edge 0-1 becomes 0->1 and 1->0
    const csr = buildUndirectedCSR(2, [[0, 1]]);
    expect(csr.vertexOffsets).toEqual([0, 1, 2]);
    expect(csr.edges.sort()).toEqual([0, 1]);
  });

  test("buildCSR handles isolated vertices", () => {
    // 4 vertices, edges only between 0 and 1
    const csr = buildCSR(4, [[0, 1], [1, 0]]);
    expect(csr.vertexOffsets).toEqual([0, 1, 2, 2, 2]);
    expect(csr.edges).toEqual([1, 0]);
  });

  test("Graph DSL: degree and forEachNeighbor", async () => {
    // Graph: 0->1, 0->2, 1->2, 2->3
    const csr = buildCSR(4, [[0, 1], [0, 2], [1, 2], [2, 3]]);

    // Memory layout:
    // vertexBase = 0: (n+1)=5 i32 values = 20 bytes (offsets 0..16)
    // edgeBase = 20: 4 i32 values = 16 bytes (offsets 20..32)
    // result area = 100: for reading results
    const vertexByteBase = 0;
    const edgeByteBase = 20;
    const resultBase = 100; // byte offset for result storage

    const binary = compile(function* () {
      yield* Mod.memory(1);

      const g = Graph(vertexByteBase, edgeByteBase);

      // getDegree(v) -> i32
      yield* Mod.exportFunc("getDegree", { v: Type.i32 }, function* (v) {
        return yield* g.degree(v);
      });

      // collectNeighbors(v) -> count: writes neighbors to result area, returns count
      yield* Mod.exportFunc("collectNeighbors", { v: Type.i32 }, function* (v) {
        const count = yield* local(Type.i32, 0);
        const resultArr = Mem.i32Array(resultBase);
        yield* g.forEachNeighbor(v, (neighbor, _edgeIdx) => [
          resultArr.store(count, neighbor),
          count.incrBy(1),
        ]);
        return count;
      });

      // readResult(idx) -> i32
      yield* Mod.exportFunc("readResult", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array(resultBase).load(idx);
      });
    });

    const { exports, mem } = await instantiate(binary);
    const getDegree = exports.getDegree as Function;
    const collectNeighbors = exports.collectNeighbors as Function;
    const readResult = exports.readResult as Function;

    // Write CSR data to memory
    writeCSR(mem!, vertexByteBase / 4, edgeByteBase / 4, csr);

    // Check degrees
    expect(getDegree(0)).toBe(2); // 0->1, 0->2
    expect(getDegree(1)).toBe(1); // 1->2
    expect(getDegree(2)).toBe(1); // 2->3
    expect(getDegree(3)).toBe(0); // no outgoing

    // Check neighbors of vertex 0
    const count0 = collectNeighbors(0);
    expect(count0).toBe(2);
    const neighbors0 = [readResult(0), readResult(1)];
    expect(neighbors0.sort()).toEqual([1, 2]);

    // Check neighbors of vertex 2
    const count2 = collectNeighbors(2);
    expect(count2).toBe(1);
    expect(readResult(0)).toBe(3);
  });
});

// ============================================================
// S-41: BFS / DFS
// ============================================================
describe("S-41: BFS / DFS", () => {
  // Memory layout for graph traversal tests:
  // vertexBase = 0, edgeBase = 100, visitedBase = 200, workBase = 400
  const VERTEX_BASE = 0;
  const EDGE_BASE = 100;
  const VISITED_BASE = 200;
  const WORK_BASE = 400;

  function makeTraversalModule(algo: "bfs" | "dfs") {
    return compile(function* () {
      yield* Mod.memory(1);

      const g = Graph(VERTEX_BASE, EDGE_BASE);

      yield* Mod.exportFunc(
        "traverse",
        { start: Type.i32 },
        function* (start) {
          if (algo === "bfs") {
            yield* bfs(g, start, VISITED_BASE, WORK_BASE);
          } else {
            yield* dfs(g, start, VISITED_BASE, WORK_BASE);
          }
        },
      );

      // Read visited[i]
      yield* Mod.exportFunc("visited", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array(VISITED_BASE).load(idx);
      });

      // Clear visited array (set n entries to 0)
      yield* Mod.exportFunc("clearVisited", { n: Type.i32 }, function* (n) {
        const i = yield* local(Type.i32);
        yield* Ctrl.range(i, n, () => [
          Mem.i32Array(VISITED_BASE).store(i, 0),
        ]);
      });
    });
  }

  for (const algo of ["bfs", "dfs"] as const) {
    describe(algo.toUpperCase(), () => {
      test("visits all vertices in a connected graph", async () => {
        // Undirected triangle: 0-1, 1-2, 0-2
        const csr = buildUndirectedCSR(3, [[0, 1], [1, 2], [0, 2]]);
        const binary = makeTraversalModule(algo);
        const { exports, mem } = await instantiate(binary);
        const traverse = exports.traverse as Function;
        const visited = exports.visited as Function;

        writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);

        traverse(0);

        expect(visited(0)).toBe(1);
        expect(visited(1)).toBe(1);
        expect(visited(2)).toBe(1);
      });

      test("does not visit disconnected vertices", async () => {
        // 4 vertices: 0-1 connected, 2-3 connected, no edge between components
        const csr = buildUndirectedCSR(4, [[0, 1], [2, 3]]);
        const binary = makeTraversalModule(algo);
        const { exports, mem } = await instantiate(binary);
        const traverse = exports.traverse as Function;
        const visited = exports.visited as Function;
        const clearVisited = exports.clearVisited as Function;

        writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);

        // Start from vertex 0: should reach 0 and 1 only
        clearVisited(4);
        traverse(0);
        expect(visited(0)).toBe(1);
        expect(visited(1)).toBe(1);
        expect(visited(2)).toBe(0);
        expect(visited(3)).toBe(0);

        // Start from vertex 2: should reach 2 and 3 only
        clearVisited(4);
        traverse(2);
        expect(visited(0)).toBe(0);
        expect(visited(1)).toBe(0);
        expect(visited(2)).toBe(1);
        expect(visited(3)).toBe(1);
      });

      test("handles single vertex graph", async () => {
        const csr = buildCSR(1, []);
        const binary = makeTraversalModule(algo);
        const { exports, mem } = await instantiate(binary);
        const traverse = exports.traverse as Function;
        const visited = exports.visited as Function;

        writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);

        traverse(0);
        expect(visited(0)).toBe(1);
      });

      test("visits all vertices in a linear chain", async () => {
        // 0 -> 1 -> 2 -> 3
        const csr = buildCSR(4, [[0, 1], [1, 2], [2, 3]]);
        const binary = makeTraversalModule(algo);
        const { exports, mem } = await instantiate(binary);
        const traverse = exports.traverse as Function;
        const visited = exports.visited as Function;

        writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);

        traverse(0);
        expect(visited(0)).toBe(1);
        expect(visited(1)).toBe(1);
        expect(visited(2)).toBe(1);
        expect(visited(3)).toBe(1);
      });
    });
  }
});

// ============================================================
// S-42: Dijkstra
// ============================================================
describe("S-42: Dijkstra", () => {
  // Memory layout:
  // vertexBase = 0, edgeBase = 100, weightBase = 200
  // distBase = 400, heapBase = 600
  const VERTEX_BASE = 0;
  const EDGE_BASE = 100;
  const WEIGHT_BASE = 200;
  const DIST_BASE = 400;
  const HEAP_BASE = 600;

  function makeDijkstraModule() {
    return compile(function* () {
      yield* Mod.memory(1);

      const g = Graph(VERTEX_BASE, EDGE_BASE);

      // dijkstra(start, n)
      yield* Mod.exportFunc(
        "shortestPath",
        { start: Type.i32, n: Type.i32 },
        function* (start, n) {
          yield* dijkstra(g, WEIGHT_BASE, start, n, DIST_BASE, HEAP_BASE);
        },
      );

      // Read dist[i]
      yield* Mod.exportFunc("dist", { idx: Type.i32 }, function* (idx) {
        return yield* Mem.i32Array(DIST_BASE).load(idx);
      });
    });
  }

  test("shortest paths in a triangle graph", async () => {
    // Triangle with weights:
    // 0 --1--> 1
    // 0 --4--> 2
    // 1 --2--> 2
    // Shortest: 0->0=0, 0->1=1, 0->2=3 (via 0->1->2)
    const csr = buildCSR(3, [[0, 1], [0, 2], [1, 2]]);
    const weights = [1, 4, 2]; // edge weights in CSR edge order

    const binary = makeDijkstraModule();
    const { exports, mem } = await instantiate(binary);
    const shortestPath = exports.shortestPath as Function;
    const dist = exports.dist as Function;

    writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);
    writeI32Array(mem!, WEIGHT_BASE / 4, weights);

    shortestPath(0, 3);

    expect(dist(0)).toBe(0);
    expect(dist(1)).toBe(1);
    expect(dist(2)).toBe(3); // via 0->1->2 (1+2=3 < 4)
  });

  test("unreachable vertex gets INT_MAX distance", async () => {
    // 0->1 with weight 5, vertex 2 is isolated
    const csr = buildCSR(3, [[0, 1]]);
    const weights = [5];

    const binary = makeDijkstraModule();
    const { exports, mem } = await instantiate(binary);
    const shortestPath = exports.shortestPath as Function;
    const dist = exports.dist as Function;

    writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);
    writeI32Array(mem!, WEIGHT_BASE / 4, weights);

    shortestPath(0, 3);

    expect(dist(0)).toBe(0);
    expect(dist(1)).toBe(5);
    expect(dist(2)).toBe(0x7FFFFFFF); // unreachable
  });

  test("diamond graph shortest paths", async () => {
    // Diamond:
    //   0 --1--> 1
    //   0 --5--> 2
    //   1 --1--> 3
    //   2 --1--> 3
    //   1 --2--> 2
    // Shortest from 0: 0=0, 1=1, 2=3 (via 0->1->2), 3=2 (via 0->1->3)
    const csr = buildWeightedCSR(4, [[0, 1, 1], [0, 2, 5], [1, 3, 1], [2, 3, 1], [1, 2, 2]]);

    const binary = makeDijkstraModule();
    const { exports, mem } = await instantiate(binary);
    const shortestPath = exports.shortestPath as Function;
    const dist = exports.dist as Function;

    writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);
    writeI32Array(mem!, WEIGHT_BASE / 4, csr.weights!);

    shortestPath(0, 4);

    expect(dist(0)).toBe(0);
    expect(dist(1)).toBe(1);
    expect(dist(2)).toBe(3); // via 0->1->2 (1+2=3 < 5)
    expect(dist(3)).toBe(2); // via 0->1->3 (1+1=2)
  });

  test("single vertex graph", async () => {
    const csr = buildCSR(1, []);
    const binary = makeDijkstraModule();
    const { exports, mem } = await instantiate(binary);
    const shortestPath = exports.shortestPath as Function;
    const dist = exports.dist as Function;

    writeCSR(mem!, VERTEX_BASE / 4, EDGE_BASE / 4, csr);

    shortestPath(0, 1);

    expect(dist(0)).toBe(0);
  });
});
