import { compile, param, local, Type, Mod, Mem, Ctrl } from "../dsl/compiler";

export function problem4_coin_change() {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;

  return compile<{ coin_change: (amount: number, numCoins: number) => number }>(function* () {
    yield* Mod.memory(2);
    const dp = Mem.i32Array();
    const coins = Mem.i32Array(COIN_BASE);

    const coin_change = yield* Mod.func(function* () {
      const amount = yield* param(Type.i32);
      const num_coins = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const coin = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);

      yield* dp.store(0, 0);

      // fill dp[1..amount] = INF
      yield* Ctrl.for(i, 1, i.le(amount), i.add(1), function* () {
        yield* dp.store(i, INF);
      });

      // for each coin j
      yield* Ctrl.for(j, 0, j.lt(num_coins), j.add(1), function* () {
        yield* coin.set(coins.load(j));
        // for i = coin to amount
        yield* Ctrl.for(i, coin, i.le(amount), i.add(1), function* () {
          // guard: skip if dp[i - coin] == INF
          yield* Ctrl.when(dp.load(i.sub(coin)).lt(INF), function* () {
            yield* tmp.set(dp.load(i.sub(coin)).add(1));
            yield* Ctrl.when(tmp.lt(dp.load(i)), function* () {
              yield* dp.store(i, tmp);
            });
          });
        });
      });

      // return dp[amount] == INF ? -1 : dp[amount]
      return yield* Ctrl.if(dp.load(amount).eq(INF))
        .then(function* () {
          return yield* Mem.i32(-1);
        })
        .else(function* () {
          return yield* dp.load(amount);
        });
    });

    yield* Mod.export("coin_change", coin_change);
  });
}
