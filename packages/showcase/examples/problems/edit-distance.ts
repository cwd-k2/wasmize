import { locals, Type, Mod, Mem, Ctrl, Op } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";

// Levenshtein edit distance via 2D DP table
// Memory layout: A at offset 0 (i32 array), B at offset 4096, DP at offset 8192
// dp[i][j] = min(dp[i-1][j]+1, dp[i][j-1]+1, dp[i-1][j-1] + (a[i-1]!=b[j-1]))

const A_BASE = 0;
const B_BASE = 4096;
const DP_BASE = 8192;

export function problem16_edit_distance() {
  return compileWithWat<{ editDistance: (la: number, lb: number) => number }>(function* () {
    yield* Mod.memory(10);
    const a = Mem.i32Array(A_BASE);
    const b = Mem.i32Array(B_BASE);

    yield* Mod.exportFunc(
      "editDistance",
      { len_a: Type.i32, len_b: Type.i32 },
      function* (len_a, len_b) {
        const [i, j, cols, cost] =
          yield* locals(Type.i32, Type.i32, [Type.i32, len_b.add(1)], Type.i32);
        const dp = Mem.i32Array2D(DP_BASE, cols);

        // dp[0][j] = j (inserting j characters)
        yield* Ctrl.range(j, cols, () => [dp.store(0, j, j)]);
        // dp[i][0] = i (deleting i characters)
        yield* Ctrl.range(i, len_a.add(1), () => [dp.store(i, 0, i)]);

        // Fill DP table
        yield* Ctrl.range(i, 1, len_a.add(1), () => [
          Ctrl.range(j, 1, len_b.add(1), () => [
            cost.set(a.load(i.sub(1)).ne(b.load(j.sub(1)))),
            dp.store(
              i,
              j,
              Op.min(
                Op.min(dp.load(i.sub(1), j).add(1), dp.load(i, j.sub(1)).add(1)),
                dp.load(i.sub(1), j.sub(1)).add(cost),
              ),
            ),
          ]),
        ]);

        return yield* dp.load(len_a, len_b);
      },
    );
  });
}
