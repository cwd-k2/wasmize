import { compile, local, Type, Mod, Op, Mem, Ctrl } from "@/dsl/compiler";

export function problem4_coin_change() {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;

  return compile<{ coin_change: (amount: number, numCoins: number) => number }>(function* () {
    yield* Mod.memory(2);
    const dp = Mem.i32Array();
    const coins = Mem.i32Array(COIN_BASE);

    yield* Mod.exportFunc(
      "coin_change",
      { amount: Type.i32, num_coins: Type.i32 },
      function* (amount, num_coins) {
        const i = yield* local(Type.i32);
        const j = yield* local(Type.i32);
        const coin = yield* local(Type.i32);
        const tmp = yield* local(Type.i32);

        yield* dp.store(0, 0);
        yield* dp.fill(1, amount, INF);

        // for each coin j
        yield* Ctrl.for(j, 0, j.lt(num_coins), j.add(1), () => [
          coin.set(coins.load(j)),
          // for i = coin to amount
          Ctrl.for(i, coin, i.le(amount), i.add(1), () => [
            // guard: skip if dp[i - coin] == INF
            Ctrl.when(dp.load(i.sub(coin)).lt(INF), () => [
              tmp.set(dp.load(i.sub(coin)).add(1)),
              Ctrl.when(tmp.lt(dp.load(i)), () => [
                dp.store(i, tmp),
              ]),
            ]),
          ]),
        ]);

        // return dp[amount] == INF ? -1 : dp[amount]
        return yield* Op.select(dp.load(amount).eq(INF), -1, dp.load(amount));
      },
    );
  });
}
