import { compile, Type, Mod, Mem } from "@/dsl/compiler";
import { instantiate } from "@/runtime/instantiate";
import { Features, scanFeatures, suggestTarget, describeFeature } from "@/wasm/capabilities";
import { compileToIR } from "@/dsl/interpreter";

/**
 * Capability-aware コンパイル例
 *
 * mutable global を使うプログラムで:
 * - scanFeatures() で必要 feature を検出
 * - suggestTarget() で最小 target を推薦
 * - Features.MVP で compile → エラー
 * - Features.Standard で compile → 成功
 */
export async function capabilityCheckExample() {
  const program = function* () {
    yield* Mod.memory(1);
    const counter = yield* Mod.global(Type.i32, 0);
    yield* Mod.exportFunc("increment", {}, function* () {
      yield* counter.set(yield* counter.get().add(Mem.i32(1)));
      return yield* counter.get();
    });
  };

  // 1. Scan features from IR
  const { funcs } = compileToIR(program, { optimize: false });
  const required = scanFeatures(funcs);

  // 2. Suggest smallest target
  const suggestion = suggestTarget(funcs);

  // 3. Describe the required features
  const descriptions = [...required].map((f) => ({
    feature: f,
    description: describeFeature(f),
  }));

  // 4. Try compiling with MVP → should fail
  let mvpError: string | null = null;
  try {
    compile(program, { target: Features.MVP });
  } catch (e) {
    mvpError = (e as Error).message;
  }

  // 5. Compile with Standard → should succeed
  const binary = compile(program, { target: Features.Standard });
  const {
    exports: { increment },
  } = await instantiate(binary);

  return {
    required: [...required], // ["mvp", "mutable-globals"]
    suggestedTarget: suggestion.name, // "Standard"
    descriptions, // feature descriptions
    mvpError, // error message about mutable-globals
    increment1: (increment as Function)(), // 1
    increment2: (increment as Function)(), // 2
  };
}
