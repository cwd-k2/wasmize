import {
  compile,
  func,
  export_,
  memory,
  param,
  local,
  mem,
  ctrl,
  loc,
} from "../dsl/compiler";

export function problem4_coin_change(): Uint8Array {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;

  return compile(function* () {
    yield* memory(2);

    const coin_change = yield* func(function* () {
      const amount = yield* param("i32");
      const num_coins = yield* param("i32");
      const i = yield* local("i32");
      const j = yield* local("i32");
      const coin = yield* local("i32");
      const tmp = yield* local("i32");

      // dp[0] = 0
      yield* mem.store(0, 0);

      // fill dp[1..amount] = INF
      yield* loc.set(i, 1);
      yield* ctrl.block(function* () {
        yield* ctrl.loop(function* () {
          yield* mem.store(i.mul(4), INF);
          yield* i.set(i.add(1));
          yield* ctrl.br_if(0, i.le(amount));
        });
      });

      // for each coin j
      yield* loc.set(j, 0);
      yield* ctrl.block(function* () {
        yield* ctrl.loop(function* () {
          // coin = mem[COIN_BASE + j*4]
          yield* coin.set(mem.load(j.mul(4).add(COIN_BASE)));
          // for i = coin to amount
          yield* i.set(coin);
          yield* ctrl.block(function* () {
            yield* ctrl.loop(function* () {
              yield* ctrl.br_if(1, i.gt(amount));
              // guard: skip if dp[i - coin] == INF
              yield* ctrl.if(mem.load(i.sub(coin).mul(4)).lt(INF))
                .then(function* () {
                  // tmp = dp[i - coin] + 1
                  yield* tmp.set(mem.load(i.sub(coin).mul(4)).add(1));
                  // if tmp < dp[i], dp[i] = tmp
                  yield* ctrl.if(tmp.lt(mem.load(i.mul(4))))
                    .then(function* () {
                      yield* mem.store(i.mul(4), tmp);
                    });
                });
              yield* i.set(i.add(1));
              yield* ctrl.br(0);
            });
          });
          // next coin
          yield* j.set(j.add(1));
          yield* ctrl.br_if(0, j.lt(num_coins));
        });
      });

      // return dp[amount] == INF ? -1 : dp[amount]
      return yield* ctrl.if(mem.load(amount.mul(4)).eq(INF))
        .then(function* () {
          return yield* mem.i32(-1);
        })
        .else(function* () {
          return yield* mem.load(amount.mul(4));
        });
    });

    yield* export_("coin_change", coin_change);
  });
}
