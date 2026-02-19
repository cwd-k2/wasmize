import { compile, local, Type, Mod, Mem, Ctrl, Queue } from "@/dsl/compiler";

export function problem12_flood_fill() {
  return compile<{
    flood_fill: (W: number, H: number, sx: number, sy: number, target: number, fill: number) => number;
  }>(function* () {
    yield* Mod.memory(4);

    yield* Mod.exportFunc(
      "flood_fill",
      { W: Type.i32, H: Type.i32, sx: Type.i32, sy: Type.i32, target: Type.i32, fill: Type.i32 },
      function* (W, H, sx, sy, target, fill) {
        const qbase = yield* local(Type.i32);
        const count = yield* local(Type.i32);
        const cx = yield* local(Type.i32);
        const cy = yield* local(Type.i32);
        const nx = yield* local(Type.i32);
        const ny = yield* local(Type.i32);
        const addr = yield* local(Type.i32);

        yield* qbase.set(W.mul(H).mul(4));
        const q = yield* Queue(qbase);

        // If start cell != target, return 0
        return yield* Ctrl.if(
          Mem.load(sy.mul(W).add(sx).mul(4)).ne(target),
        )
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
                { dx: 1, dy: 0, check: () => nx.lt(W) },     // Right
                { dx: -1, dy: 0, check: () => nx.ge(0) },    // Left
                { dx: 0, dy: 1, check: () => ny.lt(H) },     // Down
                { dx: 0, dy: -1, check: () => ny.ge(0) },    // Up
              ];

              for (const { dx, dy, check } of dirs) {
                yield* nx.set(cx.add(dx));
                yield* ny.set(cy.add(dy));
                yield* Ctrl.when(check(), () => [
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
