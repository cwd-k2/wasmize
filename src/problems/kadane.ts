import { IR } from "../wasm/ir";
import { compileProblem } from "../dsl/compiler";

export function problem3_kadane(): Uint8Array {
  const BASE = 1024;
  return compileProblem({
    funcs: [
      {
        params: ["i32"], // len
        results: ["i32"],
        locals: ["i32", "i32", "i32", "i32"], // 1=i, 2=current_sum, 3=max_sum, 4=val
        body: [
          // max_sum = current_sum = mem[BASE]
          IR.local_set(2, IR.load_i32(IR.const_i32(BASE))),
          IR.local_set(3, IR.local_get(2)),
          // i = 1
          IR.local_set(1, IR.const_i32(1)),
          // if len <= 1, skip loop
          IR.if_then_else(
            IR.cmp("gt", IR.local_get(0), IR.const_i32(1)),
            [
              IR.block([
                IR.loop([
                  // val = mem[BASE + i*4]
                  IR.local_set(
                    4,
                    IR.load_i32(
                      IR.binop(
                        "add",
                        IR.const_i32(BASE),
                        IR.binop("mul", IR.local_get(1), IR.const_i32(4)),
                      ),
                    ),
                  ),
                  // current_sum = max(val, current_sum + val)
                  IR.local_set(
                    2,
                    IR.if_then_else(
                      IR.cmp(
                        "gt",
                        IR.binop("add", IR.local_get(2), IR.local_get(4)),
                        IR.local_get(4),
                      ),
                      [IR.binop("add", IR.local_get(2), IR.local_get(4))],
                      [IR.local_get(4)],
                    ),
                  ),
                  // max_sum = max(max_sum, current_sum)
                  IR.local_set(
                    3,
                    IR.if_then_else(
                      IR.cmp("gt", IR.local_get(2), IR.local_get(3)),
                      [IR.local_get(2)],
                      [IR.local_get(3)],
                    ),
                  ),
                  // i++
                  IR.local_set(
                    1,
                    IR.binop("add", IR.local_get(1), IR.const_i32(1)),
                  ),
                  IR.br_if(
                    0,
                    IR.cmp("lt", IR.local_get(1), IR.local_get(0)),
                  ),
                ]),
              ]),
              IR.nop(),
            ],
            [],
            "void",
          ),
          IR.local_get(3),
        ],
      },
    ],
    exports: [{ name: "kadane", funcIdx: 0 }],
    memoryPages: 2,
  });
}
