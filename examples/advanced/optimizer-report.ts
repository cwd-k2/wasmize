import { param, local, Type, Mod, Ctrl } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";
import { compileWithReport, formatReport } from "@/wasm/optimizer-report";

/**
 * 最適化レポート例
 *
 * Fibonacci を compileWithReport でコンパイルし、最適化の前後比較を出力。
 * レポートにはノード数・メモリ操作・分岐の削減率が含まれる。
 */
export async function optimizerReportExample() {
  const { binary, report } = compileWithReport<{ fib: (n: number) => number }>(function* () {
    yield* Mod.memory(1);
    yield* Mod.exportFunc("fib", {}, function* () {
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
    });
  });

  const {
    exports: { fib },
  } = await instantiate(binary);

  return {
    // Function works correctly
    fib10: fib(10), // 55
    fib20: fib(20), // 6765

    // Report summary
    formatted: formatReport(report),

    // Raw numbers
    beforeNodes: report.before.totalNodes,
    afterNodes: report.after.totalNodes,
    reduction: report.reductions.nodesPct.toFixed(1) + "%",
    passCount: report.passes.length,
    iterations: report.iterations,
  };
}
