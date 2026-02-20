import { local, Type, Mod, Mem, Ctrl, Loc, Queue } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import { instantiate } from "@/runtime/instantiate";

// Grid maze shortest path via BFS
// Memory layout:
//   offset 0         = maze grid (w*h bytes, 0=passage, 1=wall)
//   offset w*h       = distance grid (w*h i32 values, -1=unvisited)
//   offset w*h+w*h*4 = queue (i32 pairs: flat index)
//
// Returns shortest distance from start to goal, or -1 if unreachable.

type Exports = {
  solve: (w: number, h: number, sx: number, sy: number, gx: number, gy: number) => number;
};

const NEIGHBORS_4 = [
  { dx: 1, dy: 0 },
  { dx: -1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: 0, dy: -1 },
] as const;

function mazeBfsWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(10);

    yield* Mod.exportFunc(
      "solve",
      { w: Type.i32, h: Type.i32, sx: Type.i32, sy: Type.i32, gx: Type.i32, gy: Type.i32 },
      function* (w, h, sx, sy, gx, gy) {
        const gridSize = yield* local(Type.i32);
        const distBase = yield* local(Type.i32);
        const qBase = yield* local(Type.i32);
        const cx = yield* local(Type.i32);
        const cy = yield* local(Type.i32);
        const ci = yield* local(Type.i32);
        const nx = yield* local(Type.i32);
        const ny = yield* local(Type.i32);
        const ni = yield* local(Type.i32);
        const idx = yield* local(Type.i32);
        const curDist = yield* local(Type.i32);
        const startIdx = yield* local(Type.i32);

        yield* gridSize.set(w.mul(h));
        yield* distBase.set(gridSize);
        yield* qBase.set(gridSize.add(gridSize.mul(4)));

        const maze = Mem.byteGrid(0, w);
        const dist = Mem.i32Array(distBase);
        const q = yield* Queue(qBase);

        // Initialize all distances to -1
        yield* Ctrl.range(idx, gridSize, () => [dist.store(idx, -1)]);

        // Enqueue start
        yield* startIdx.set(sy.mul(w).add(sx));
        yield* dist.store(startIdx, 0);
        yield* q.enqueue(startIdx);

        // BFS
        yield* Ctrl.while(q.notEmpty, function* () {
          yield* q.dequeue(ci);
          yield* cy.set(ci.div(w));
          yield* cx.set(ci.sub(cy.mul(w)));
          yield* curDist.set(dist.load(ci));

          // Check if we reached the goal
          yield* Ctrl.when(cx.eq(gx).and(cy.eq(gy)), function* () {
            yield* Loc.return(curDist);
          });

          // Explore 4 neighbors
          for (const { dx, dy } of NEIGHBORS_4) {
            yield* nx.set(cx.add(dx));
            yield* ny.set(cy.add(dy));
            yield* Ctrl.when(nx.ge(0).and(nx.lt(w)).and(ny.ge(0)).and(ny.lt(h)), function* () {
              yield* ni.set(ny.mul(w).add(nx));
              // If passage and unvisited
              yield* Ctrl.when(maze.load(ny, nx).eq(0).and(dist.load(ni).eq(-1)), function* () {
                yield* dist.store(ni, curDist.add(1));
                yield* q.enqueue(ni);
              });
            });
          }
        });

        return -1; // unreachable
      },
    );
  });
}

export async function mazeBfs() {
  const binary = mazeBfsWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    solve: exports.solve,
    setMaze(grid: number[]) {
      for (let i = 0; i < grid.length; i++) {
        bytes![i] = grid[i];
      }
    },
    binary,
  };
}
