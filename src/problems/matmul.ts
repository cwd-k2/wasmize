import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem8_matmul(): Uint8Array {
  return compile(function* () {
    yield* Mod.memory(2);

    // matmul(n) — A at offset 0, B at n*n*4, C at 2*n*n*4
    // Returns C[0][0] for verification
    const matmul = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const k = yield* local(Type.i32);
      const sum = yield* local(Type.i32);
      const nn = yield* local(Type.i32); // n*n
      const baseB = yield* local(Type.i32); // nn*4
      const baseC = yield* local(Type.i32); // nn*8

      yield* nn.set(n.mul(n));
      yield* baseB.set(nn.mul(4));
      yield* baseC.set(nn.mul(8));

      // Triple loop: i, j, k
      yield* i.set(0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Ctrl.br_if(1, i.ge(n));

          yield* j.set(0);
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              yield* Ctrl.br_if(1, j.ge(n));

              yield* sum.set(0);
              yield* k.set(0);
              yield* Ctrl.block(function* () {
                yield* Ctrl.loop(function* () {
                  yield* Ctrl.br_if(1, k.ge(n));
                  // sum += A[i*n+k] * B[k*n+j]
                  yield* sum.set(
                    sum.add(
                      Mem.load(i.mul(n).add(k).mul(4))
                        .mul(Mem.load(k.mul(n).add(j).mul(4).add(baseB))),
                    ),
                  );
                  yield* k.set(k.add(1));
                  yield* Ctrl.br(0);
                });
              });
              // C[i*n+j] = sum
              yield* Mem.store(i.mul(n).add(j).mul(4).add(baseC), sum);

              yield* j.set(j.add(1));
              yield* Ctrl.br(0);
            });
          });

          yield* i.set(i.add(1));
          yield* Ctrl.br(0);
        });
      });

      // Return C[0][0]
      return yield* Mem.load(baseC);
    });

    yield* Mod.export("matmul", matmul);
  });
}
