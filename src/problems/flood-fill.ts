import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem12_flood_fill() {
  return compile<{
    flood_fill: (W: number, H: number, sx: number, sy: number, target: number, fill: number) => number;
  }>(function* () {
    yield* Mod.memory(4);

    // flood_fill(W, H, sx, sy, target, fill) -> count of filled cells
    // Grid at offset 0 (W*H*4), BFS queue at W*H*4 (pairs of x,y as i32)
    const flood_fill = yield* Mod.func(function* () {
      const W = yield* param(Type.i32);
      const H = yield* param(Type.i32);
      const sx = yield* param(Type.i32);
      const sy = yield* param(Type.i32);
      const target = yield* param(Type.i32);
      const fill = yield* param(Type.i32);
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
          yield* Ctrl.while(head.lt(tail), function* () {
            yield* cx.set(Mem.load(head.mul(4).add(qbase)));
            yield* cy.set(Mem.load(head.add(1).mul(4).add(qbase)));
            yield* head.set(head.add(2));

            // 4 directions: right(1,0), left(-1,0), down(0,1), up(0,-1)
            yield* Ctrl.for(d, 0, d.lt(4), d.add(1), function* () {
              yield* Ctrl.if(d.eq(0))
                .then(function* () {
                  yield* nx.set(cx.add(1));
                  yield* ny.set(cy);
                })
                .else(function* () {
                  yield* Ctrl.if(d.eq(1))
                    .then(function* () {
                      yield* nx.set(cx.sub(1));
                      yield* ny.set(cy);
                    })
                    .else(function* () {
                      yield* Ctrl.if(d.eq(2))
                        .then(function* () {
                          yield* nx.set(cx);
                          yield* ny.set(cy.add(1));
                        })
                        .else(function* () {
                          yield* nx.set(cx);
                          yield* ny.set(cy.sub(1));
                        });
                    });
                });

              // Bounds check first, then value check
              yield* Ctrl.when(
                nx.ge(0).and(nx.lt(W)).and(ny.ge(0)).and(ny.lt(H)),
                function* () {
                  yield* Ctrl.when(
                    Mem.load(ny.mul(W).add(nx).mul(4)).eq(target),
                    function* () {
                      yield* Mem.store(ny.mul(W).add(nx).mul(4), fill);
                      yield* Mem.store(tail.mul(4).add(qbase), nx);
                      yield* Mem.store(tail.add(1).mul(4).add(qbase), ny);
                      yield* tail.set(tail.add(2));
                      yield* count.set(count.add(1));
                    },
                  );
                },
              );
            });
          });

          return yield* Loc.get(count);
        });
    });

    yield* Mod.export("flood_fill", flood_fill);
  });
}
