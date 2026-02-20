import { compile, param, Type, Mod, Mem } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";
import { builtinPasses, withoutPasses, type OptimizerPass } from "@/wasm/optimizer-passes";
import { IR, type IRNode } from "@/wasm/ir";

/**
 * カスタムオプティマイザパス例
 *
 * 2 つの使用パターン:
 * 1. カスタムパスの追加 — doubleStoreElim（同一アドレスへの連続 store を冗長除去）
 * 2. パスの除外 — withoutPasses で定数畳み込みをスキップ
 */

// --- カスタムパス: 連続 store の冗長除去 ---

const doubleStoreElim: OptimizerPass = {
  name: "double-store-elimination",
  transform(node: IRNode): IRNode {
    // seq([store(addr, v1), store(addr, v2)]) → seq([store(addr, v2)])
    if (node.op === "seq") {
      const stmts: IRNode[] = [];
      for (let i = 0; i < node.stmts.length; i++) {
        const curr = node.stmts[i]!;
        const next = node.stmts[i + 1];
        // Skip current store if next store writes to the same address
        if (
          curr.op === "store_i32" &&
          next?.op === "store_i32" &&
          JSON.stringify(curr.addr) === JSON.stringify(next.addr)
        ) {
          continue; // drop redundant store
        }
        stmts.push(curr);
      }
      if (stmts.length < node.stmts.length) {
        return stmts.length === 1 ? stmts[0]! : IR.seq(stmts);
      }
    }
    return node;
  },
};

export async function customOptimizerExample() {
  // --- 1. カスタムパスを追加 ---
  const withCustom = compile<{ get: () => number }>(
    function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("get", {}, function* () {
        // addr 0 に 2 回 store → 1 回に最適化
        yield* Mem.store(0, Mem.i32(100));
        yield* Mem.store(0, Mem.i32(42));
        return yield* Mem.load(0);
      });
    },
    {
      optimizerConfig: {
        passes: [...builtinPasses, doubleStoreElim],
        iterations: 2,
      },
    },
  );

  const inst1 = await instantiate(withCustom);

  // --- 2. パスの除外: 定数畳み込みをスキップ ---
  const noConstFold = compile<{ add: (a: number, b: number) => number }>(
    function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("add", {}, function* () {
        const a = yield* param(Type.i32);
        const b = yield* param(Type.i32);
        // Without constant folding, 0 + a is NOT simplified to a
        // (identity-elimination still handles it though)
        return yield* a.add(b);
      });
    },
    {
      optimizerConfig: {
        passes: withoutPasses(["constant-folding"]),
      },
    },
  );

  const inst2 = await instantiate(noConstFold);

  return {
    // Custom pass results
    customPassResult: inst1.exports.get(), // 42

    // Excluded pass still computes correctly
    addResult: inst2.exports.add(3, 4), // 7
  };
}
