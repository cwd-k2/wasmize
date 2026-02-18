import { IR } from "../wasm/ir";
import { compileProblem } from "../dsl/compiler";

export function problem4_coin_change(): Uint8Array {
  const COIN_BASE = 2048;
  const INF = 0x7fffffff;
  return compileProblem({
    funcs: [
      {
        params: ["i32", "i32"], // amount, num_coins
        results: ["i32"],
        locals: ["i32", "i32", "i32", "i32"], // 2=i, 3=j, 4=coin, 5=tmp
        body: [
          // dp[0] = 0
          IR.store_i32(IR.const_i32(0), IR.const_i32(0)),
          // fill dp[1..amount] = INF
          IR.local_set(2, IR.const_i32(1)),
          IR.block([
            IR.loop([
              IR.store_i32(
                IR.binop("mul", IR.local_get(2), IR.const_i32(4)),
                IR.const_i32(INF),
              ),
              IR.local_set(
                2,
                IR.binop("add", IR.local_get(2), IR.const_i32(1)),
              ),
              IR.br_if(0, IR.cmp("le", IR.local_get(2), IR.local_get(0))),
            ]),
          ]),
          // for each coin j
          IR.local_set(3, IR.const_i32(0)),
          IR.block([
            IR.loop([
              // coin = mem[COIN_BASE + j*4]
              IR.local_set(
                4,
                IR.load_i32(
                  IR.binop(
                    "add",
                    IR.const_i32(COIN_BASE),
                    IR.binop("mul", IR.local_get(3), IR.const_i32(4)),
                  ),
                ),
              ),
              // for i = coin to amount
              IR.local_set(2, IR.local_get(4)),
              IR.block([
                IR.loop([
                  // if i > amount, break
                  IR.br_if(
                    1,
                    IR.cmp("gt", IR.local_get(2), IR.local_get(0)),
                  ),
                  // guard: skip if dp[i - coin] == INF (avoid overflow)
                  IR.if_then_else(
                    IR.cmp(
                      "lt",
                      IR.load_i32(
                        IR.binop(
                          "mul",
                          IR.binop("sub", IR.local_get(2), IR.local_get(4)),
                          IR.const_i32(4),
                        ),
                      ),
                      IR.const_i32(INF),
                    ),
                    [
                      // tmp = dp[i - coin] + 1
                      IR.local_set(
                        5,
                        IR.binop(
                          "add",
                          IR.load_i32(
                            IR.binop(
                              "mul",
                              IR.binop("sub", IR.local_get(2), IR.local_get(4)),
                              IR.const_i32(4),
                            ),
                          ),
                          IR.const_i32(1),
                        ),
                      ),
                      // if tmp < dp[i], dp[i] = tmp
                      IR.if_then_else(
                        IR.cmp(
                          "lt",
                          IR.local_get(5),
                          IR.load_i32(
                            IR.binop("mul", IR.local_get(2), IR.const_i32(4)),
                          ),
                        ),
                        [
                          IR.store_i32(
                            IR.binop("mul", IR.local_get(2), IR.const_i32(4)),
                            IR.local_get(5),
                          ),
                        ],
                        [],
                        "void",
                      ),
                    ],
                    [],
                    "void",
                  ),
                  IR.local_set(
                    2,
                    IR.binop("add", IR.local_get(2), IR.const_i32(1)),
                  ),
                  IR.br(0),
                ]),
              ]),
              // next coin
              IR.local_set(
                3,
                IR.binop("add", IR.local_get(3), IR.const_i32(1)),
              ),
              IR.br_if(0, IR.cmp("lt", IR.local_get(3), IR.local_get(1))),
            ]),
          ]),
          // return dp[amount] == INF ? -1 : dp[amount]
          IR.if_then_else(
            IR.cmp(
              "eq",
              IR.load_i32(
                IR.binop("mul", IR.local_get(0), IR.const_i32(4)),
              ),
              IR.const_i32(INF),
            ),
            [IR.const_i32(-1)],
            [
              IR.load_i32(
                IR.binop("mul", IR.local_get(0), IR.const_i32(4)),
              ),
            ],
          ),
        ],
      },
    ],
    exports: [{ name: "coin_change", funcIdx: 0 }],
    memoryPages: 2,
  });
}
