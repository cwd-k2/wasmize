import { compile, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";

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
        const head = yield* local(Type.i32, 0);
        const tail = yield* local(Type.i32, 0);
        const count = yield* local(Type.i32);
        const cx = yield* local(Type.i32);
        const cy = yield* local(Type.i32);
        const nx = yield* local(Type.i32);
        const ny = yield* local(Type.i32);
        const addr = yield* local(Type.i32);

        yield* qbase.set(W.mul(H).mul(4));

        // If start cell != target, return 0
        return yield* Ctrl.if(
          Mem.load(sy.mul(W).add(sx).mul(4)).ne(target),
        )
          .then(function* () {
            return 0;
          })
          .else(function* () {
            yield* Mem.store(tail.mul(4).add(qbase), sx);
            yield* Mem.store(tail.add(1).mul(4).add(qbase), sy);
            yield* tail.incrBy(2);
            yield* Mem.store(sy.mul(W).add(sx).mul(4), fill);
            yield* count.set(1);

            // BFS loop — 4 directions unrolled (eliminates for+switch overhead)
            yield* Ctrl.while(head.lt(tail), () => [
              cx.set(Mem.load(head.mul(4).add(qbase))),
              cy.set(Mem.load(head.add(1).mul(4).add(qbase))),
              head.incrBy(2),

              // Right: (cx+1, cy)
              nx.set(cx.add(1)),
              ny.set(cy),
              Ctrl.when(
                nx.lt(W),
                () => [
                  addr.set(ny.mul(W).add(nx).mul(4)),
                  Ctrl.when(Mem.load(addr).eq(target), () => [
                    Mem.store(addr, fill),
                    Mem.store(tail.mul(4).add(qbase), nx),
                    Mem.store(tail.add(1).mul(4).add(qbase), ny),
                    tail.incrBy(2),
                    count.incrBy(1),
                  ]),
                ],
              ),

              // Left: (cx-1, cy)
              nx.set(cx.sub(1)),
              ny.set(cy),
              Ctrl.when(
                nx.ge(0),
                () => [
                  addr.set(ny.mul(W).add(nx).mul(4)),
                  Ctrl.when(Mem.load(addr).eq(target), () => [
                    Mem.store(addr, fill),
                    Mem.store(tail.mul(4).add(qbase), nx),
                    Mem.store(tail.add(1).mul(4).add(qbase), ny),
                    tail.incrBy(2),
                    count.incrBy(1),
                  ]),
                ],
              ),

              // Down: (cx, cy+1)
              nx.set(cx),
              ny.set(cy.add(1)),
              Ctrl.when(
                ny.lt(H),
                () => [
                  addr.set(ny.mul(W).add(nx).mul(4)),
                  Ctrl.when(Mem.load(addr).eq(target), () => [
                    Mem.store(addr, fill),
                    Mem.store(tail.mul(4).add(qbase), nx),
                    Mem.store(tail.add(1).mul(4).add(qbase), ny),
                    tail.incrBy(2),
                    count.incrBy(1),
                  ]),
                ],
              ),

              // Up: (cx, cy-1)
              nx.set(cx),
              ny.set(cy.sub(1)),
              Ctrl.when(
                ny.ge(0),
                () => [
                  addr.set(ny.mul(W).add(nx).mul(4)),
                  Ctrl.when(Mem.load(addr).eq(target), () => [
                    Mem.store(addr, fill),
                    Mem.store(tail.mul(4).add(qbase), nx),
                    Mem.store(tail.add(1).mul(4).add(qbase), ny),
                    tail.incrBy(2),
                    count.incrBy(1),
                  ]),
                ],
              ),
            ]);

            return count;
          });
      },
    );
  });
}
