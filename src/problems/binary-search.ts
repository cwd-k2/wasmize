import { IR } from "../wasm/ir";
import { compileProblem } from "../dsl/compiler";

export function problem5_binary_search(): Uint8Array {
  return compileProblem({
    funcs: [
      {
        params: ["i32", "i32"], // len, target
        results: ["i32"],
        locals: ["i32", "i32", "i32", "i32"], // 2=lo, 3=hi, 4=mid, 5=val
        body: [
          IR.local_set(2, IR.const_i32(0)),
          IR.local_set(
            3,
            IR.binop("sub", IR.local_get(0), IR.const_i32(1)),
          ),
          IR.block([
            IR.loop([
              // if lo > hi, break
              IR.br_if(1, IR.cmp("gt", IR.local_get(2), IR.local_get(3))),
              // mid = (lo + hi) / 2
              IR.local_set(
                4,
                IR.binop(
                  "div",
                  IR.binop("add", IR.local_get(2), IR.local_get(3)),
                  IR.const_i32(2),
                ),
              ),
              // val = mem[mid*4]
              IR.local_set(
                5,
                IR.load_i32(
                  IR.binop("mul", IR.local_get(4), IR.const_i32(4)),
                ),
              ),
              // if val == target, return mid
              IR.if_then_else(
                IR.cmp("eq", IR.local_get(5), IR.local_get(1)),
                [IR.return_(IR.local_get(4))],
                [
                  // if val < target, lo = mid + 1, else hi = mid - 1
                  IR.if_then_else(
                    IR.cmp("lt", IR.local_get(5), IR.local_get(1)),
                    [
                      IR.local_set(
                        2,
                        IR.binop("add", IR.local_get(4), IR.const_i32(1)),
                      ),
                    ],
                    [
                      IR.local_set(
                        3,
                        IR.binop("sub", IR.local_get(4), IR.const_i32(1)),
                      ),
                    ],
                    "void",
                  ),
                  IR.nop(),
                ],
                "void",
              ),
              IR.br(0),
            ]),
          ]),
          IR.const_i32(-1), // not found
        ],
      },
    ],
    exports: [{ name: "binary_search", funcIdx: 0 }],
  });
}
