import { compile, local, Type, Mod, Mem, Ctrl } from "@/dsl/compiler";
import { bench } from "@/bench";

/**
 * Benchmark harness: Sieve of Eratosthenes (Wasm vs JS).
 *
 * bench() は warmup → iterations 回の実行時間を計測し、
 * mean / median / stddev を返す。baseline 指定で JS との speedup も算出。
 */
export async function benchSieve() {
  const binary = compile<{ sieve: (n: number) => number }>(function* () {
    yield* Mod.memory(2);

    yield* Mod.exportFunc("sieve", { n: Type.i32 }, function* (n) {
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const count = yield* local(Type.i32, 0);

      // i32 チャンクで 0x01010101 を一括書き込み
      yield* Ctrl.for(i, 0, i.le(n.div(4)), i.add(1), () => [Mem.store(i.mul(4), 0x01010101)]);
      yield* Mem.store8(0, 0);
      yield* Mem.store8(1, 0);

      // p*p <= n のふるい
      yield* Ctrl.for(i, 2, i.mul(i).le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [
          Ctrl.for(j, i.mul(i), j.le(n), j.add(i), () => [Mem.store8(j, 0)]),
        ]),
      ]);

      // 素数カウント
      yield* Ctrl.for(i, 2, i.le(n), i.add(1), () => [
        Ctrl.when(Mem.load8(i).eq(1), () => [count.incrBy(1)]),
      ]);

      return count;
    });
  });

  return bench(
    binary,
    "sieve",
    () => {
      return [10000]; // 10000 以下の素数を数える
    },
    {
      warmup: 10,
      iterations: 50,
      baseline: (n: number) => {
        // JS 実装の Sieve of Eratosthenes
        const arr = new Uint8Array(n + 1).fill(1);
        arr[0] = arr[1] = 0;
        for (let i = 2; i * i <= n; i++) {
          if (arr[i]) {
            for (let j = i * i; j <= n; j += i) arr[j] = 0;
          }
        }
        let count = 0;
        for (let i = 2; i <= n; i++) if (arr[i]) count++;
        return count;
      },
    },
  );
}
