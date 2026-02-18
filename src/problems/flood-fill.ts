import { compile, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem12_flood_fill() {
  return compile<{
    flood_fill: (W: number, H: number, sx: number, sy: number, target: number, fill: number) => number;
  }>(function* () {
    yield* Mod.memory(4);

    // flood_fill(W, H, sx, sy, target, fill) -> count of filled cells
    // Grid at offset 0 (W*H*4), BFS queue at W*H*4 (pairs of x,y as i32)
    yield* Mod.exportFunc(
      "flood_fill",
      { W: Type.i32, H: Type.i32, sx: Type.i32, sy: Type.i32, target: Type.i32, fill: Type.i32 },
      function* (W, H, sx, sy, target, fill) {
        const qbase = yield* local(Type.i32);
        const head = yield* local(Type.i32, 0);
        const tail = yield* local(Type.i32, 0);
        const count = yield* local(Type.i32);
        const cx = yield* local(Type.i32);
        const cy = yield* local(Type.i32);
        const nx = yield* local(Type.i32);
        const ny = yield* local(Type.i32);
        const d = yield* local(Type.i32);

        yield* qbase.set(W.mul(H).mul(4));

        // If start cell != target, return 0
        return yield* Ctrl.if(
          Mem.load(sy.mul(W).add(sx).mul(4)).ne(target),
        )
          .then(function* () {
            return yield* Mem.i32(0);
          })
          .else(function* () {
            yield* Mem.store(tail.mul(4).add(qbase), sx);
            yield* Mem.store(tail.add(1).mul(4).add(qbase), sy);
            yield* tail.set(tail.add(2));
            yield* Mem.store(sy.mul(W).add(sx).mul(4), fill);
            yield* count.set(1);

            // BFS loop
            yield* Ctrl.while(head.lt(tail), () => [
              cx.set(Mem.load(head.mul(4).add(qbase))),
              cy.set(Mem.load(head.add(1).mul(4).add(qbase))),
              head.set(head.add(2)),

              // 4 directions: right(1,0), left(-1,0), down(0,1), up(0,-1)
              Ctrl.for(d, 0, d.lt(4), d.add(1), () => [
                Ctrl.switch(d, [
                  [0, () => [nx.set(cx.add(1)), ny.set(cy)]],
                  [1, () => [nx.set(cx.sub(1)), ny.set(cy)]],
                  [2, () => [nx.set(cx), ny.set(cy.add(1))]],
                  [3, () => [nx.set(cx), ny.set(cy.sub(1))]],
                ]),

                // Bounds check first, then value check
                Ctrl.when(
                  nx.ge(0).and(nx.lt(W)).and(ny.ge(0)).and(ny.lt(H)),
                  () => [
                    Ctrl.when(
                      Mem.load(ny.mul(W).add(nx).mul(4)).eq(target),
                      () => [
                        Mem.store(ny.mul(W).add(nx).mul(4), fill),
                        Mem.store(tail.mul(4).add(qbase), nx),
                        Mem.store(tail.add(1).mul(4).add(qbase), ny),
                        tail.set(tail.add(2)),
                        count.set(count.add(1)),
                      ],
                    ),
                  ],
                ),
              ]),
            ]);

            return yield* Loc.get(count);
          });
      },
    );
  });
}
