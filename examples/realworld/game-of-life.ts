import { compile, local, Type, Mod, Mem, Ctrl, Meta } from "@/dsl/compiler";
import type { WasmRef } from "@/dsl/types";
import { instantiate } from "@/test-helpers";

// Conway's Game of Life with double-buffered byte grids
// Memory layout: grid A = offset 0 (w*h bytes), grid B = offset w*h (next gen)

type Exports = {
  step: (w: number, h: number) => void;
  getCell: (x: number, y: number, w: number) => number;
};

function gameOfLifeWasm() {
  return compile<Exports>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc(
      "step",
      { w: Type.i32, h: Type.i32 },
      function* (w, h) {
        const x = yield* local(Type.i32);
        const y = yield* local(Type.i32);
        const count = yield* local(Type.i32);
        const cell = yield* local(Type.i32);
        const gridSize = yield* local(Type.i32);
        const nx = yield* local(Type.i32);
        const ny = yield* local(Type.i32);

        yield* gridSize.set(w.mul(h));

        // For each cell, count neighbors and compute next state
        yield* Ctrl.range(y, h, function* () {
          yield* Ctrl.range(x, w, function* () {
            yield* count.set(0);
            yield* cell.set(Mem.load8(y.mul(w).add(x)));

            // Count 8 neighbors — compile-time unrolled via Meta.neighbors8
            for (const { dx, dy } of Meta.neighbors8) {
              yield* ny.set(y.add(dy));
              yield* nx.set(x.add(dx));
              yield* Ctrl.when(
                ny.ge(0).and(ny.lt(h)).and(nx.ge(0)).and(nx.lt(w)),
                () => [count.incrBy(Mem.load8(ny.mul(w).add(nx)))],
              );
            }

            // TODO: ユーザー実装 — alive 判定ロジック
            // count (近傍の生存セル数) と cell (現在の状態 0/1) から
            // 次世代の状態を gridB に書き込む
            yield* aliveLogic(count, cell, gridSize, y, w, x);
          });
        });

        // Copy gridB → gridA
        yield* Ctrl.range(x, gridSize, function* () {
          yield* Mem.store8(x, Mem.load8(x.add(gridSize)));
        });
      },
    );

    yield* Mod.exportFunc(
      "getCell",
      { x: Type.i32, y: Type.i32, w: Type.i32 },
      function* (x, y, w) {
        return yield* Mem.load8(y.mul(w).add(x));
      },
    );
  });
}

// alive 判定ロジック: gridB[y*w+x] に next state を書き込み
function* aliveLogic(
  count: WasmRef<"i32">,
  cell: WasmRef<"i32">,
  gridSize: WasmRef<"i32">,
  y: WasmRef<"i32">,
  w: WasmRef<"i32">,
  x: WasmRef<"i32">,
) {
  // Conway's rules:
  //   alive cell + 2 or 3 neighbors → survives
  //   dead cell + exactly 3 neighbors → born
  //   otherwise → dead
  // Branchless: alive = count==3 | (cell & count==2)
  yield* Mem.store8(
    gridSize.add(y.mul(w)).add(x),
    count.eq(3).or(cell.and(count.eq(2))),
  );
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
