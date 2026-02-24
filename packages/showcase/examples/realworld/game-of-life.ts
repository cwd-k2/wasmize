import { locals, local, Type, Mod, Mem, Ctrl } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";
import type { WasmRef } from "wasmize/dsl/types";
import { instantiate } from "wasmize/runtime/instantiate";

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
      const [count, cell, gridSize, nx, ny] =
        yield* locals(Type.i32, Type.i32, Type.i32, Type.i32, Type.i32);

      yield* gridSize.set(w.mul(h));
      const gridA = Mem.byteGrid(0, w);
      const gridB = Mem.byteGrid(gridSize, w);

      // For each cell, count neighbors and compute next state
      yield* Ctrl.grid([h, w], (y, x) => {
        const stmts = [count.set(0), cell.set(gridA.load(y, x))];

        // Count 8 neighbors — compile-time unrolled
        for (const { dx, dy } of NEIGHBORS_8) {
          stmts.push(
            ny.set(y.add(dy)),
            nx.set(x.add(dx)),
            Ctrl.when(ny.inRange(0, h).and(nx.inRange(0, w)), () => [
              count.incrBy(gridA.load(ny, nx)),
            ]),
          );
        }

        stmts.push(aliveLogicStmt(count, cell, gridB, y, x));
        return stmts;
      });

      // Copy gridB → gridA
      const copyIdx = yield* local(Type.i32);
      yield* Ctrl.range(copyIdx, gridSize, function* () {
        yield* Mem.store8(copyIdx, Mem.load8(copyIdx.add(gridSize)));
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

// alive 判定: Branchless — alive = count==3 | (cell & count==2)
function aliveLogicStmt(
  count: WasmRef<"i32">,
  cell: WasmRef<"i32">,
  gridB: ReturnType<typeof Mem.byteGrid>,
  y: WasmRef<"i32">,
  x: WasmRef<"i32">,
) {
  return gridB.store(y, x, count.eq(3).or(cell.and(count.eq(2))));
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
