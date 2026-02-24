/**
 * P4: Coin Change — minimum coins to make amount.
 *
 * Approach: Bottom-up DP, dp[i] = min coins for amount i.
 * Memory layout: coins at COIN_BASE, dp table at DP_BASE (i32 arrays).
 * Complexity: O(amount * numCoins) time.
 * DSL features: Op.min, Mem.i32Array, nested Ctrl.range.
 */
import { locals, Type, Mod, Op, Mem, Ctrl } from "wasmize/dsl/compiler";
import { compileWithWat } from "wasmize/debug";

export function problem4_coin_change() {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;

  return compileWithWat<{ coin_change: (amount: number, numCoins: number) => number }>(
    function* () {
      yield* Mod.memory(2);
      const dp = Mem.i32Array();
      const coins = Mem.i32Array(COIN_BASE);

      yield* Mod.exportFunc(
        "coin_change",
        { amount: Type.i32, num_coins: Type.i32 },
        function* (amount, num_coins) {
          const [i, j, coin, tmp] = yield* locals(Type.i32, Type.i32, Type.i32, Type.i32);

          yield* dp.store(0, 0);
          yield* dp.fill(1, amount, INF);

          // for each coin j
          yield* Ctrl.range(j, num_coins, () => [
            coin.set(coins.load(j)),
            // for i = coin to amount
            Ctrl.for(i, coin, i.le(amount), i.add(1), () => [
              // guard: skip if dp[i - coin] == INF
              Ctrl.when(dp.load(i.sub(coin)).lt(INF), () => [
                tmp.set(dp.load(i.sub(coin)).add(1)),
                Ctrl.when(tmp.lt(dp.load(i)), () => [dp.store(i, tmp)]),
              ]),
            ]),
          ]);

          // return dp[amount] == INF ? -1 : dp[amount]
          return yield* Op.select(dp.load(amount).eq(INF), -1, dp.load(amount));
        },
      );
    },
  );
}
