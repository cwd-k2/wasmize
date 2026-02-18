import {
  compile,
  func,
  export_,
  memory,
  param,
  local,
  i32,
  get,
  add,
  sub,
  mul,
  eq,
  lt,
  le,
  gt,
  set,
  store,
  load,
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
      yield* store(i32(0), i32(0));

      // fill dp[1..amount] = INF
      yield* set(i, i32(1));
      yield* block_(function* () {
        yield* loop_(function* () {
          yield* store(mul(get(i), i32(4)), i32(INF));
          yield* set(i, add(get(i), i32(1)));
          yield* br_if(0, le(get(i), get(amount)));
        });
      });

      // for each coin j
      yield* set(j, i32(0));
      yield* block_(function* () {
        yield* loop_(function* () {
          // coin = mem[COIN_BASE + j*4]
          yield* set(coin, load(add(i32(COIN_BASE), mul(get(j), i32(4)))));
          // for i = coin to amount
          yield* set(i, get(coin));
          yield* block_(function* () {
            yield* loop_(function* () {
              yield* br_if(1, gt(get(i), get(amount)));
              // guard: skip if dp[i - coin] == INF
              yield* if_(
                lt(load(mul(sub(get(i), get(coin)), i32(4))), i32(INF)),
                function* () {
                  // tmp = dp[i - coin] + 1
                  yield* set(
                    tmp,
                    add(load(mul(sub(get(i), get(coin)), i32(4))), i32(1)),
                  );
                  // if tmp < dp[i], dp[i] = tmp
                  yield* if_(
                    lt(get(tmp), load(mul(get(i), i32(4)))),
                    function* () {
                      yield* store(mul(get(i), i32(4)), get(tmp));
                    },
                  );
                },
              );
              yield* set(i, add(get(i), i32(1)));
              yield* br(0);
            });
          });
          // next coin
          yield* set(j, add(get(j), i32(1)));
          yield* br_if(0, lt(get(j), get(num_coins)));
        });
      });

      // return dp[amount] == INF ? -1 : dp[amount]
      return yield* if_(
        eq(load(mul(get(amount), i32(4))), i32(INF)),
        function* () {
          return yield* i32(-1);
        },
        function* () {
          return yield* load(mul(get(amount), i32(4)));
        },
      );
    });

    yield* export_("coin_change", coin_change);
  });
}
