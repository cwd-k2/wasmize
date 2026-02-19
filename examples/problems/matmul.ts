import { local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem8_matmul() {
  return compileWithWat<{ matmul: (n: number) => number }>(function* () {
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

      yield* Ctrl.range(i, n, function* () {
        yield* iRowA.set(i.mul(n4));

        yield* Ctrl.range(j, n, function* () {
          yield* sum.set(0);
          yield* jColB.set(j.mul(4).add(baseB));
          yield* bStride.set(0);

          yield* Ctrl.range(k, n, () => [
            // A[i][k] * B[k][j] — stride-based addressing eliminates k*n mul
            sum.incrBy(
              Mem.load(iRowA.add(k.mul(4)))
                .mul(Mem.load(bStride.add(jColB))),
            ),
            bStride.incrBy(n4),
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
