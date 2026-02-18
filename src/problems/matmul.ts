import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem8_matmul() {
  return compile<{ matmul: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    const matmul = yield* Mod.func(function* () {
      const n = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const k = yield* local(Type.i32);
      const sum = yield* local(Type.i32);
      const nn = yield* local(Type.i32);
      const baseB = yield* local(Type.i32);
      const baseC = yield* local(Type.i32);

      yield* nn.set(n.mul(n));
      yield* baseB.set(nn.mul(4));
      yield* baseC.set(nn.mul(8));

      const A = Mem.i32Array2D(0, n);

      yield* Ctrl.for(i, 0, i.lt(n), i.add(1), function* () {
        yield* Ctrl.for(j, 0, j.lt(n), j.add(1), function* () {
          yield* sum.set(0);
          yield* Ctrl.for(k, 0, k.lt(n), k.add(1), function* () {
            // sum += A[i][k] * B[k][j]
            yield* sum.set(
              sum.add(
                A.load(i, k)
                  .mul(Mem.load(k.mul(n).add(j).mul(4).add(baseB))),
              ),
            );
          });
          // C[i*n+j] = sum — use dynamic base via raw Mem.store
          yield* Mem.store(i.mul(n).add(j).mul(4).add(baseC), sum);
        });
      });

      // Return C[0][0]
      return yield* Mem.load(baseC);
    });

    yield* Mod.export("matmul", matmul);
  });
}
