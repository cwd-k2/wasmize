import { IR } from "../wasm/ir";
import { compileProblem } from "../dsl/compiler";

export function problem2_fib_dp(): Uint8Array {
  return compileProblem({
    funcs: [
      {
        params: ["i32"],
        results: ["i32"],
        locals: ["i32"], // local 1 = i (loop counter)
        body: [
          // mem[0] = 0, mem[4] = 1
          IR.store_i32(IR.const_i32(0), IR.const_i32(0)),
          IR.store_i32(IR.const_i32(4), IR.const_i32(1)),
          // if n <= 1, return mem[n*4]
          IR.if_then_else(
            IR.cmp("le", IR.local_get(0), IR.const_i32(1)),
            [
              IR.load_i32(
                IR.binop("mul", IR.local_get(0), IR.const_i32(4)),
              ),
            ],
            [
              // i = 2
              IR.local_set(1, IR.const_i32(2)),
              // loop
              IR.block([
                IR.loop([
                  // mem[i*4] = mem[(i-1)*4] + mem[(i-2)*4]
                  IR.store_i32(
                    IR.binop("mul", IR.local_get(1), IR.const_i32(4)),
                    IR.binop(
                      "add",
                      IR.load_i32(
                        IR.binop(
                          "mul",
                          IR.binop(
                            "sub",
                            IR.local_get(1),
                            IR.const_i32(1),
                          ),
                          IR.const_i32(4),
                        ),
                      ),
                      IR.load_i32(
                        IR.binop(
                          "mul",
                          IR.binop(
                            "sub",
                            IR.local_get(1),
                            IR.const_i32(2),
                          ),
                          IR.const_i32(4),
                        ),
                      ),
                    ),
                  ),
                  // i++
                  IR.local_set(
                    1,
                    IR.binop("add", IR.local_get(1), IR.const_i32(1)),
                  ),
                  // if i <= n, continue loop
                  IR.br_if(
                    0,
                    IR.cmp("le", IR.local_get(1), IR.local_get(0)),
                  ),
                ]),
              ]),
              // return mem[n*4]
              IR.load_i32(
                IR.binop("mul", IR.local_get(0), IR.const_i32(4)),
              ),
            ],
          ),
        ],
      },
    ],
    exports: [{ name: "fib", funcIdx: 0 }],
  });
}
