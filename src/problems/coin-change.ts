import { compile, param, local, Type, Mod, Mem, Ctrl, Loc } from "../dsl/compiler";

export function problem4_coin_change(): Uint8Array {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;

  return compile(function* () {
    yield* Mod.memory(2);

    const coin_change = yield* Mod.func(function* () {
      const amount = yield* param(Type.i32);
      const num_coins = yield* param(Type.i32);
      const i = yield* local(Type.i32);
      const j = yield* local(Type.i32);
      const coin = yield* local(Type.i32);
      const tmp = yield* local(Type.i32);

      // dp[0] = 0
      yield* Mem.store(0, 0);

      // fill dp[1..amount] = INF
      yield* Loc.set(i, 1);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          yield* Mem.store(i.mul(4), INF);
          yield* i.set(i.add(1));
          yield* Ctrl.br_if(0, i.le(amount));
        });
      });

      // for each coin j
      yield* Loc.set(j, 0);
      yield* Ctrl.block(function* () {
        yield* Ctrl.loop(function* () {
          // coin = mem[COIN_BASE + j*4]
          yield* coin.set(Mem.load(j.mul(4).add(COIN_BASE)));
          // for i = coin to amount
          yield* i.set(coin);
          yield* Ctrl.block(function* () {
            yield* Ctrl.loop(function* () {
              yield* Ctrl.br_if(1, i.gt(amount));
              // guard: skip if dp[i - coin] == INF
              yield* Ctrl.if(Mem.load(i.sub(coin).mul(4)).lt(INF))
                .then(function* () {
                  // tmp = dp[i - coin] + 1
                  yield* tmp.set(Mem.load(i.sub(coin).mul(4)).add(1));
                  // if tmp < dp[i], dp[i] = tmp
                  yield* Ctrl.if(tmp.lt(Mem.load(i.mul(4))))
                    .then(function* () {
                      yield* Mem.store(i.mul(4), tmp);
                    });
                });
              yield* i.set(i.add(1));
              yield* Ctrl.br(0);
            });
          });
          // next coin
          yield* j.set(j.add(1));
          yield* Ctrl.br_if(0, j.lt(num_coins));
        });
      });

      // return dp[amount] == INF ? -1 : dp[amount]
      return yield* Ctrl.if(Mem.load(amount.mul(4)).eq(INF))
        .then(function* () {
          return yield* Mem.i32(-1);
        })
        .else(function* () {
          return yield* Mem.load(amount.mul(4));
        });
    });

    yield* Mod.export("coin_change", coin_change);
  });
}
