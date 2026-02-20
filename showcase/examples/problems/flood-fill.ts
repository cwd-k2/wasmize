/**
 * P12: Flood Fill — BFS-based region coloring on a 2D grid.
 *
 * Approach: BFS using Queue helper with 4-directional expansion.
 * Memory layout: byte grid at offset 0, Queue buffer above grid region.
 * Complexity: O(rows * cols) time and space.
 * DSL features: Queue (BFS helper), Mem.byteGrid, Meta.each for 4 directions.
 */
import { locals, Type, Mod, Mem, Ctrl, Queue } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem12_flood_fill() {
  return compileWithWat<{
    flood_fill: (
      W: number,
      H: number,
      sx: number,
      sy: number,
      target: number,
      fill: number,
    ) => number;
  }>(function* () {
    yield* Mod.memory(4);

    yield* Mod.exportFunc(
      "flood_fill",
      { W: Type.i32, H: Type.i32, sx: Type.i32, sy: Type.i32, target: Type.i32, fill: Type.i32 },
      function* (W, H, sx, sy, target, fill) {
        const [qbase, count, cx, cy, nx, ny, addr] =
          yield* locals(Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32);

        yield* qbase.set(W.mul(H).mul(4));
        const q = yield* Queue(qbase);

        // If start cell != target, return 0
        return yield* Ctrl.if(Mem.load(sy.mul(W).add(sx).mul(4)).ne(target))
          .then(function* () {
            return 0;
          })
          .else(function* () {
            // Enqueue start: push sx then sy
            yield* q.enqueue(sx);
            yield* q.enqueue(sy);
            yield* Mem.store(sy.mul(W).add(sx).mul(4), fill);
            yield* count.set(1);

            // BFS loop — 4 directions via JS metaprogramming
            yield* Ctrl.while(q.notEmpty, function* () {
              yield* q.dequeue(cx);
              yield* q.dequeue(cy);

              const dirs = [
                { dx: 1, dy: 0 },
                { dx: -1, dy: 0 },
                { dx: 0, dy: 1 },
                { dx: 0, dy: -1 },
              ];

              for (const { dx, dy } of dirs) {
                yield* nx.set(cx.add(dx));
                yield* ny.set(cy.add(dy));
                yield* Ctrl.when(nx.inRange(0, W).and(ny.inRange(0, H)), () => [
                  addr.set(ny.mul(W).add(nx).mul(4)),
                  Ctrl.when(Mem.load(addr).eq(target), () => [
                    Mem.store(addr, fill),
                    q.enqueue(nx),
                    q.enqueue(ny),
                    count.incrBy(1),
                  ]),
                ]);
              }
            });

            return count;
          });
      },
    );
  });
}
