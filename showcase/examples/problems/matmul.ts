/**
 * P8: Matrix Multiplication — C = A × B (n×n square matrices).
 *
 * Approach: Triple-nested loop with Mem.i32Array2D for 2D indexing.
 * Memory layout: three n×n i32 matrices at fixed offsets.
 * Complexity: O(n³) time.
 * DSL features: Mem.i32Array2D, triple Ctrl.range.
 */
import { locals, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { compileWithWat } from "@/debug";

export function problem8_matmul() {
  return compileWithWat<{ matmul: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("matmul", { n: Type.i32 }, function* (n) {
      const [i, j, k, sum, nn, baseB, baseC, n4, iRowA, jColB, bStride] =
        yield* locals(
          Type.i32, Type.i32, Type.i32, Type.i32, Type.i32, Type.i32,
          Type.i32, Type.i32, Type.i32, Type.i32, Type.i32,
        );

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
            sum.incrBy(Mem.load(iRowA.add(k.mul(4))).mul(Mem.load(bStride.add(jColB)))),
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
