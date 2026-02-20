import { compile, param, local, Type, Mod, Ctrl, withTrace, type TraceEntry } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";
import { createProfile, withProfiling, type InstructionProfile } from "@/dsl/instrument";

/**
 * Intercept トレース + プロファイル例
 *
 * Fibonacci 関数を withTrace + withProfiling でコンパイル:
 * - trace: 各 FuncInstruction の型と内容を収集
 * - profile: decl/stmt/if/loop の出現回数
 * - 生成 Wasm は同一（intercept は非破壊）
 */
export async function interceptTraceExample() {
  const trace: TraceEntry[] = [];
  const profile: InstructionProfile = createProfile();

  const binary = compile<{ fib: (n: number) => number }>(function* () {
    yield* Mod.memory(1);
    yield* Mod.exportFunc("fib", {}, function* () {
      return yield* withProfiling(
        withTrace(
          "fib",
          (function* () {
            const n = yield* param(Type.i32);
            const a = yield* local(Type.i32, 0);
            const b = yield* local(Type.i32, 1);
            const tmp = yield* local(Type.i32);

            const i = yield* local(Type.i32);
            yield* Ctrl.range(i, n, function* () {
              yield* tmp.set(yield* b.add(a));
              yield* a.set(b);
              yield* b.set(tmp);
            });

            return a;
          })(),
          trace,
        ),
        profile,
      );
    });
  });

  const {
    exports: { fib },
  } = await instantiate(binary);

  return {
    // Fibonacci works correctly
    fib5: fib(5), // 5
    fib10: fib(10), // 55

    // Trace: each instruction yielded during compilation
    traceEntries: trace.length,
    traceTypes: [...new Set(trace.map((e) => e.instruction._type))],
    traceLabel: trace[0]?.label, // "fib"

    // Profile: instruction type counts
    profile: {
      params: profile.params,
      locals: profile.locals,
      stmts: profile.stmts,
      blocks: profile.blocks,
      total: profile.total,
    },
  };
}
