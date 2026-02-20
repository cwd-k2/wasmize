import { locals, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";
import type { WasmRef } from "@/dsl/types";
import { instantiate } from "@/runtime/instantiate";

// Conway's Game of Life with double-buffered byte grids
// Memory layout: grid A = offset 0 (w*h bytes), grid B = offset w*h (next gen)

type Exports = {
  step: (w: number, h: number) => void;
  getCell: (x: number, y: number, w: number) => number;
};

const NEIGHBORS_8 = [
  { dx: -1, dy: -1 },
  { dx: -1, dy: 0 },
  { dx: -1, dy: 1 },
  { dx: 0, dy: -1 },
  { dx: 0, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 1, dy: 1 },
] as const;

function gameOfLifeWasm() {
  return compileWithWat<Exports>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("step", { w: Type.i32, h: Type.i32 }, function* (w, h) {
      const [x, y, count, cell, gridSize, nx, ny] =
        yield* locals(Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32);

      yield* gridSize.set(w.mul(h));
      const gridA = Mem.byteGrid(0, w);
      const gridB = Mem.byteGrid(gridSize, w);

      // For each cell, count neighbors and compute next state
      yield* Ctrl.range(y, h, function* () {
        yield* Ctrl.range(x, w, function* () {
          yield* count.set(0);
          yield* cell.set(gridA.load(y, x));

          // Count 8 neighbors — compile-time unrolled
          for (const { dx, dy } of NEIGHBORS_8) {
            yield* ny.set(y.add(dy));
            yield* nx.set(x.add(dx));
            yield* Ctrl.when(ny.ge(0).and(ny.lt(h)).and(nx.ge(0)).and(nx.lt(w)), () => [
              count.incrBy(gridA.load(ny, nx)),
            ]);
          }

          yield* aliveLogic(count, cell, gridB, y, x);
        });
      });

      // Copy gridB → gridA
      yield* Ctrl.range(x, gridSize, function* () {
        yield* Mem.store8(x, Mem.load8(x.add(gridSize)));
      });
    });

    yield* Mod.exportFunc(
      "getCell",
      { x: Type.i32, y: Type.i32, w: Type.i32 },
      function* (x, y, w) {
        const grid = Mem.byteGrid(0, w);
        return yield* grid.load(y, x);
      },
    );
  });
}

// alive 判定ロジック: gridB[y][x] に next state を書き込み
function* aliveLogic(
  count: WasmRef<"i32">,
  cell: WasmRef<"i32">,
  gridB: ReturnType<typeof Mem.byteGrid>,
  y: WasmRef<"i32">,
  x: WasmRef<"i32">,
) {
  // Conway's rules:
  //   alive cell + 2 or 3 neighbors → survives
  //   dead cell + exactly 3 neighbors → born
  //   otherwise → dead
  // Branchless: alive = count==3 | (cell & count==2)
  yield* gridB.store(y, x, count.eq(3).or(cell.and(count.eq(2))));
}

export async function gameOfLife() {
  const binary = gameOfLifeWasm();
  const { exports, bytes } = await instantiate(binary);

  return {
    step: exports.step,
    getCell: exports.getCell,
    setGrid(cells: number[]) {
      for (let i = 0; i < cells.length; i++) {
        bytes![i] = cells[i];
      }
    },
    getGrid(w: number, h: number): number[] {
      const result: number[] = [];
      for (let i = 0; i < w * h; i++) {
        result.push(bytes![i]);
      }
      return result;
    },
    binary,
  };
}
