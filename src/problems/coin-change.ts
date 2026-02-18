import {
  compile,
  func,
  export_,
  memory,
  param,
  local,
  i32,
  set,
  store,
  br,
  br_if,
  if_,
  loop_,
  block_,
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
      yield* store(0, 0);

      // fill dp[1..amount] = INF
      yield* set(i, 1);
      yield* block_(function* () {
        yield* loop_(function* () {
          yield* i.mul(4).store(INF);
          yield* i.set(i.add(1));
          yield* br_if(0, i.le(amount));
        });
      });

      // for each coin j
      yield* set(j, 0);
      yield* block_(function* () {
        yield* loop_(function* () {
          // coin = mem[COIN_BASE + j*4]
          yield* coin.set(j.mul(4).add(COIN_BASE).load());
          // for i = coin to amount
          yield* i.set(coin);
          yield* block_(function* () {
            yield* loop_(function* () {
              yield* br_if(1, i.gt(amount));
              // guard: skip if dp[i - coin] == INF
              yield* if_(i.sub(coin).mul(4).load().lt(INF))
                .then(function* () {
                  // tmp = dp[i - coin] + 1
                  yield* tmp.set(i.sub(coin).mul(4).load().add(1));
                  // if tmp < dp[i], dp[i] = tmp
                  yield* if_(tmp.lt(i.mul(4).load()))
                    .then(function* () {
                      yield* i.mul(4).store(tmp);
                    });
                });
              yield* i.set(i.add(1));
              yield* br(0);
            });
          });
          // next coin
          yield* j.set(j.add(1));
          yield* br_if(0, j.lt(num_coins));
        });
      });

      // return dp[amount] == INF ? -1 : dp[amount]
      return yield* if_(amount.mul(4).load().eq(INF))
        .then(function* () {
          return yield* i32(-1);
        })
        .else(function* () {
          return yield* amount.mul(4).load();
        });
    });

    yield* export_("coin_change", coin_change);
  });
}
