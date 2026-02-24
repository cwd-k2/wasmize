import type { FuncGen, FuncInstruction } from "./types";
import { type ExprInput, ChainableExpr, resolve } from "./expr";
import { IR } from "../wasm/ir";

export interface BitSetHandle {
  /** Sets the bit at `idx` to 1. */
  set(idx: ExprInput): FuncGen<void>;
  /** Returns 1 if the bit at `idx` is set, 0 otherwise. */
  get(idx: ExprInput): ChainableExpr;
  /** Clears the bit at `idx` to 0. */
  clear(idx: ExprInput): FuncGen<void>;
  /** Zeroes all bytes covering `bitCount` bits. Compile-time unrolled. */
  clearAll(bitCount: number): FuncGen<void>;
}

/**
 * Creates a bit array backed by linear memory.
 *
 * No internal locals — plain function, not a Generator factory.
 * Bit `idx` is stored at byte `base + (idx >>> 3)`, bit position `idx & 7`.
 *
 * @param base - Base byte offset for the bit array (default 0)
 */
export function BitSet(base: ExprInput = 0): BitSetHandle {
  return {
    set(idx: ExprInput): FuncGen<void> {
      return (function* () {
        const vi = yield* resolve(idx);
        const vb = yield* resolve(base);
        const byteAddr = IR.binop("add", vb._node, IR.binop("shr_u", vi._node, IR.const_i32(3)));
        const bitPos = IR.binop("and", vi._node, IR.const_i32(7));
        const mask = IR.binop("shl", IR.const_i32(1), bitPos);
        const current = IR.load_i32_8u(byteAddr);
        const updated = IR.binop("or", current, mask);
        yield { _type: "stmt", node: IR.store_i32_8(byteAddr, updated) } as FuncInstruction;
      })();
    },

    get(idx: ExprInput): ChainableExpr {
      return new ChainableExpr(
        (function* () {
          const vi = yield* resolve(idx);
          const vb = yield* resolve(base);
          const byteAddr = IR.binop(
            "add",
            vb._node,
            IR.binop("shr_u", vi._node, IR.const_i32(3)),
          );
          const bitPos = IR.binop("and", vi._node, IR.const_i32(7));
          const shifted = IR.binop("shr_u", IR.load_i32_8u(byteAddr), bitPos);
          const bit = IR.binop("and", shifted, IR.const_i32(1));
          return { _tag: "val" as const, _node: bit };
        })(),
      );
    },

    clear(idx: ExprInput): FuncGen<void> {
      return (function* () {
        const vi = yield* resolve(idx);
        const vb = yield* resolve(base);
        const byteAddr = IR.binop("add", vb._node, IR.binop("shr_u", vi._node, IR.const_i32(3)));
        const bitPos = IR.binop("and", vi._node, IR.const_i32(7));
        const mask = IR.binop(
          "xor",
          IR.binop("shl", IR.const_i32(1), bitPos),
          IR.const_i32(-1),
        );
        const current = IR.load_i32_8u(byteAddr);
        const updated = IR.binop("and", current, mask);
        yield { _type: "stmt", node: IR.store_i32_8(byteAddr, updated) } as FuncInstruction;
      })();
    },

    clearAll(bitCount: number): FuncGen<void> {
      const byteCount = Math.ceil(bitCount / 8);
      return (function* () {
        const vb = yield* resolve(base);
        for (let i = 0; i < byteCount; i++) {
          const addr = i === 0 ? vb._node : IR.binop("add", vb._node, IR.const_i32(i));
          yield { _type: "stmt", node: IR.store_i32_8(addr, IR.const_i32(0)) } as FuncInstruction;
        }
      })();
    },
  };
}
