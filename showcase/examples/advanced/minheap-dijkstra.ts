/**
 * MinHeap Dijkstra — 重み付きグリッド最短経路
 *
 * MinHeap を priority queue として使い、Dijkstra のアルゴリズムで
 * 重み付き 2D グリッド上の最短経路距離を計算する。
 *
 * DSL features: MinHeap, inRange, Ctrl.grid, Mem.i32Array2D
 */
import { locals, Type, Mod, Mem, Ctrl, Loc, MinHeap } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/runtime/instantiate";

const INF = 0x7fffffff;

const NEIGHBORS_4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

type Exports = {
  dijkstra: (w: number, h: number, sx: number, sy: number, gx: number, gy: number) => number;
};

// Memory layout (all i32):
//   offset 0:         weight grid  (w*h i32 — traversal cost per cell)
//   offset w*h*4:     distance grid (w*h i32 — shortest distance, INF=0x7FFFFFFF)
//   offset w*h*8:     MinHeap backing buffer

function dijkstraWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(10);

    yield* Mod.exportFunc(
      "dijkstra",
      { w: Type.i32, h: Type.i32, sx: Type.i32, sy: Type.i32, gx: Type.i32, gy: Type.i32 },
      function* (w, h, sx, sy, gx, gy) {
        const [gridSize, distBase, heapBase, ci, cx, cy, nx, ny, ni, curDist, newDist, pri, val] =
          yield* locals(
            Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32,
            Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32,
          );

        yield* gridSize.set(w.mul(h));
        yield* distBase.set(gridSize.mul(4));
        yield* heapBase.set(gridSize.mul(8));

        const weight = Mem.i32Array(0);
        const dist = Mem.i32Array(distBase);
        const heap = yield* MinHeap(heapBase);

        // Initialize all distances to INF using Ctrl.grid
        yield* Ctrl.grid([h, w], (y, x) => [
          dist.store(y.mul(w).add(x), INF),
        ]);

        // Set start distance to weight of start cell
        yield* ci.set(sy.mul(w).add(sx));
        yield* dist.store(ci, weight.load(ci));
        yield* heap.insert(weight.load(ci), ci);

        // Dijkstra main loop
        yield* Ctrl.while(heap.notEmpty, function* () {
          yield* heap.extractMin(pri, val);
          yield* ci.set(val);
          yield* curDist.set(pri);

          // Skip if we already found a shorter path
          yield* Ctrl.when(curDist.gt(dist.load(ci)), function* () {
            yield* Ctrl.br(1); // continue while loop
          });

          // Decode cell index to (cx, cy) coordinates
          yield* cy.set(ci.div(w));
          yield* cx.set(ci.sub(cy.mul(w)));
          yield* Ctrl.when(cx.eq(gx).and(cy.eq(gy)), function* () {
            yield* Loc.return(curDist);
          });

          // Explore 4 neighbors
          for (const { dx, dy } of NEIGHBORS_4) {
            yield* nx.set(cx.add(dx));
            yield* ny.set(cy.add(dy));
            yield* Ctrl.when(nx.inRange(0, w).and(ny.inRange(0, h)), function* () {
              yield* ni.set(ny.mul(w).add(nx));
              yield* newDist.set(curDist.add(weight.load(ni)));
              // Relax edge if shorter
              yield* Ctrl.when(newDist.lt(dist.load(ni)), function* () {
                yield* dist.store(ni, newDist);
                yield* heap.insert(newDist, ni);
              });
            });
          }
        });

        return -1; // unreachable from start
      },
    );
  });
}

export async function minheapDijkstra() {
  const binary = dijkstraWasm();
  const { exports, mem } = await instantiate(binary);

  return {
    /** Set the weight grid. weights[y * w + x] = traversal cost. */
    setWeights(weights: number[]) {
      for (let i = 0; i < weights.length; i++) {
        mem![i] = weights[i];
      }
    },
    /** Read shortest distance to cell (x, y) after running dijkstra. */
    getDistance(x: number, y: number, w: number, h: number) {
      const distBase = w * h; // word offset (distBase bytes = w*h*4, so word offset = w*h)
      const val = mem![distBase + y * w + x];
      return val === INF ? -1 : val;
    },
    dijkstra: exports.dijkstra,
    binary,
  };
}
