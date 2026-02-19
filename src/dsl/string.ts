import type { BumpAllocator } from "./allocator";
import { Mem } from "./namespaces";
import { ChainableExpr, add, eq, ne, type ExprInput, resolve } from "./expr";
import { IR } from "../wasm/ir";
import { val, WasmRef, type FuncInstruction } from "./types";

const encoder = new TextEncoder();

/**
 * String utilities for the DSL.
 *
 * - `Str.from()` — compile-time: embed UTF-8 in a data segment via allocator
 * - `Str.len()` — runtime: null-terminated strlen
 * - `Str.eq()` — runtime: compare two byte regions for equality
 * - `Str.cmp()` — runtime: lexicographic byte comparison
 */
export const Str = {
  /**
   * Embeds a UTF-8 string into the allocator's memory region.
   * Returns `{ ptr, len }` where both are compile-time constants.
   * A null terminator is appended automatically.
   */
  from(allocator: BumpAllocator, str: string): { ptr: number; len: number; bytes: Uint8Array } {
    const encoded = encoder.encode(str);
    const ptr = allocator.bytes(encoded.length + 1); // +1 for null terminator
    return { ptr, len: encoded.length, bytes: encoded };
  },

  /**
   * Runtime strlen: counts bytes until null terminator.
   * `ptr` is a byte address in linear memory.
   */
  len(ptr: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(
      (function* () {
        // Save initial ptr value to compute length later
        const start: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        const p: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;

        const vp = yield* resolve(ptr);
        yield { _type: "stmt", node: IR.local_set(start._idx, vp._node) } as FuncInstruction;
        yield { _type: "stmt", node: IR.local_set(p._idx, vp._node) } as FuncInstruction;

        // loop: while mem[p] != 0, p++
        yield {
          _type: "block" as const,
          body: function* () {
            yield {
              _type: "loop" as const,
              body: function* () {
                const vLoad = yield* Mem.load8(p);
                const vCond = yield* resolve(eq(vLoad, 0));
                yield { _type: "stmt", node: IR.br_if(1, vCond._node) } as FuncInstruction;
                yield { _type: "stmt", node: IR.local_set(p._idx, IR.binop("add", IR.local_get(p._idx), IR.const_i32(1))) } as FuncInstruction;
                yield { _type: "stmt", node: IR.br(0) } as FuncInstruction;
              },
            };
          },
        };
        // return p - start
        return val(IR.binop("sub", IR.local_get(p._idx), IR.local_get(start._idx)));
      })() as Generator<FuncInstruction, any, any>,
    );
  },

  /**
   * Runtime equality check: compares `len` bytes at addresses `a` and `b`.
   * Returns 1 if equal, 0 otherwise.
   */
  eq(a: ExprInput, b: ExprInput, len: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(
      (function* () {
        const i: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        const result: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        yield { _type: "stmt", node: IR.local_set(result._idx, IR.const_i32(1)) } as FuncInstruction;
        yield { _type: "stmt", node: IR.local_set(i._idx, IR.const_i32(0)) } as FuncInstruction;

        yield {
          _type: "block" as const,
          body: function* () {
            yield {
              _type: "loop" as const,
              body: function* () {
                const vi = yield* resolve(i as ExprInput);
                const vLen = yield* resolve(len);
                const cond = yield* resolve(ne(vi, vLen));
                yield { _type: "stmt", node: IR.br_if(1, IR.eqz(cond._node)) } as FuncInstruction;
                const va = yield* Mem.load8(add(a, i));
                const vb = yield* Mem.load8(add(b, i));
                const neq = yield* resolve(ne(va, vb));
                yield {
                  _type: "if" as const,
                  cond: neq._node,
                  then_: function* () {
                    yield { _type: "stmt", node: IR.local_set(result._idx, IR.const_i32(0)) } as FuncInstruction;
                    yield { _type: "stmt", node: IR.br(2) } as FuncInstruction;
                  },
                } as FuncInstruction;
                yield { _type: "stmt", node: IR.local_set(i._idx, IR.binop("add", IR.local_get(i._idx), IR.const_i32(1))) } as FuncInstruction;
                yield { _type: "stmt", node: IR.br(0) } as FuncInstruction;
              },
            };
          },
        };
        return val(IR.local_get(result._idx));
      })() as Generator<FuncInstruction, any, any>,
    );
  },

  /**
   * Runtime lexicographic comparison of null-terminated strings.
   * Returns <0 if a < b, 0 if equal, >0 if a > b.
   */
  cmp(a: ExprInput, b: ExprInput): ChainableExpr<"i32"> {
    return new ChainableExpr(
      (function* () {
        const i: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        const ca: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        const cb: WasmRef = yield { _type: "decl", kind: "local", valType: "i32" } as FuncInstruction;
        yield { _type: "stmt", node: IR.local_set(i._idx, IR.const_i32(0)) } as FuncInstruction;

        yield {
          _type: "block" as const,
          body: function* () {
            yield {
              _type: "loop" as const,
              body: function* () {
                const loadA = yield* Mem.load8(add(a, i));
                yield { _type: "stmt", node: IR.local_set(ca._idx, loadA._node) } as FuncInstruction;
                const loadB = yield* Mem.load8(add(b, i));
                yield { _type: "stmt", node: IR.local_set(cb._idx, loadB._node) } as FuncInstruction;
                const diff = yield* resolve(ne(ca, cb));
                yield { _type: "stmt", node: IR.br_if(1, diff._node) } as FuncInstruction;
                const ended = yield* resolve(eq(ca, 0));
                yield { _type: "stmt", node: IR.br_if(1, ended._node) } as FuncInstruction;
                yield { _type: "stmt", node: IR.local_set(i._idx, IR.binop("add", IR.local_get(i._idx), IR.const_i32(1))) } as FuncInstruction;
                yield { _type: "stmt", node: IR.br(0) } as FuncInstruction;
              },
            };
          },
        };
        return val(IR.binop("sub", IR.local_get(ca._idx), IR.local_get(cb._idx)));
      })() as Generator<FuncInstruction, any, any>,
    );
  },
};
