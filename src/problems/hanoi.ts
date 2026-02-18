import { IR } from "../wasm/ir";
import { compileProblem } from "../dsl/compiler";

export function problem1_hanoi(): Uint8Array {
  return compileProblem({
    imports: [
      {
        module: "env",
        name: "effect_move",
        params: ["i32", "i32"],
        results: [],
      },
    ],
    funcs: [
      {
        // hanoi(n, from, to, aux) -> i32
        params: ["i32", "i32", "i32", "i32"],
        results: ["i32"],
        locals: ["i32", "i32"], // local 4=count1, 5=count2
        body: [
          IR.if_then_else(
            IR.cmp("le", IR.local_get(0), IR.const_i32(0)),
            [IR.const_i32(0)],
            [
              // count1 = hanoi(n-1, from, aux, to)
              IR.local_set(
                4,
                IR.call(1, [
                  IR.binop("sub", IR.local_get(0), IR.const_i32(1)),
                  IR.local_get(1),
                  IR.local_get(3),
                  IR.local_get(2),
                ]),
              ),
              // effect_move(from, to) — void function, no drop needed
              IR.call(0, [IR.local_get(1), IR.local_get(2)]),
              // count2 = hanoi(n-1, aux, to, from)
              IR.local_set(
                5,
                IR.call(1, [
                  IR.binop("sub", IR.local_get(0), IR.const_i32(1)),
                  IR.local_get(3),
                  IR.local_get(2),
                  IR.local_get(1),
                ]),
              ),
              // return count1 + 1 + count2
              IR.binop(
                "add",
                IR.binop("add", IR.local_get(4), IR.const_i32(1)),
                IR.local_get(5),
              ),
            ],
          ),
        ],
      },
    ],
    exports: [{ name: "hanoi", funcIdx: 0 }],
  });
}
