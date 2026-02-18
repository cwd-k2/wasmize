import { compile, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem8_matmul() {
  return compile<{ matmul: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("matmul", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const k = yield* local(Type.i32);
      const sum = yield* local(Type.i32);
      const nn = yield* local(Type.i32);
      const baseB = yield* local(Type.i32);
      const baseC = yield* local(Type.i32);
      const n4 = yield* local(Type.i32);
      const iRowA = yield* local(Type.i32);
      const jColB = yield* local(Type.i32);
      const bStride = yield* local(Type.i32);

      yield* nn.set(n.mul(n));
      yield* baseB.set(nn.mul(4));
      yield* baseC.set(nn.mul(8));
      yield* n4.set(n.mul(4));

      yield* Ctrl.for(i, 0, i.lt(n), i.add(1), function* () {
        yield* iRowA.set(i.mul(n4));

        yield* Ctrl.for(j, 0, j.lt(n), j.add(1), function* () {
          yield* sum.set(0);
          yield* jColB.set(j.mul(4).add(baseB));
          yield* bStride.set(0);

          yield* Ctrl.for(k, 0, k.lt(n), k.add(1), () => [
            // A[i][k] * B[k][j] — stride-based addressing eliminates k*n mul
            sum.set(
              sum.add(
                Mem.load(iRowA.add(k.mul(4)))
                  .mul(Mem.load(bStride.add(jColB))),
              ),
            ),
            bStride.set(bStride.add(n4)),
          ]);

          // C[i][j] = sum
          yield* Mem.store(iRowA.add(j.mul(4)).add(baseC), sum);
        });
      });

      // Return C[0][0]
      return yield* Mem.load(baseC);
    });
  });
}
