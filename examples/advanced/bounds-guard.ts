import { compile, param, local, Type, Mod, Mem } from "@/dsl/compiler";
import { instantiate } from "@/test-helpers";
import { withBoundsCheck } from "@/dsl/guard";

/**
 * メモリ境界ガード例
 *
 * 同一アルゴリズムを production/debug で切り替え:
 * - Production: withBoundsCheck なし → OOB は silent corruption or Wasm trap
 * - Debug: withBoundsCheck(gen, maxBytes) → OOB で unreachable トラップ
 */

function memAccessBody() {
  return function* () {
    const addr = yield* param(Type.i32);
    const val = yield* param(Type.i32);
    const result = yield* local(Type.i32);
    yield* Mem.store(addr, val);
    yield* result.set(yield* Mem.load(addr));
    return result;
  };
}

export async function boundsGuardExample() {
  const MAX_BYTES = 1024; // Guard boundary: only first 1KB allowed

  // --- Production build: no guard ---
  const prodBinary = compile<{ access: (addr: number, val: number) => number }>(function* () {
    yield* Mod.memory(1);
    yield* Mod.exportFunc("access", {}, memAccessBody());
  });

  // --- Debug build: with bounds check ---
  const debugBinary = compile<{ access: (addr: number, val: number) => number }>(function* () {
    yield* Mod.memory(1);
    yield* Mod.exportFunc("access", {}, function* () {
      return yield* withBoundsCheck(memAccessBody()(), MAX_BYTES);
    });
  });

  const prod = await instantiate(prodBinary);
  const debug = await instantiate(debugBinary);

  // Normal access: both succeed
  const prodResult = prod.exports.access(0, 42);
  const debugResult = debug.exports.access(0, 42);

  // OOB access: prod silently succeeds (within Wasm page), debug traps
  const prodOOB = prod.exports.access(2000, 99); // Within 64KB, succeeds
  let debugTrapped = false;
  try {
    debug.exports.access(2000, 99); // > 1024, traps
  } catch {
    debugTrapped = true;
  }

  return {
    prodResult,                // 42
    debugResult,               // 42
    prodOOB,                   // 99 (silently succeeds)
    debugTrapped,              // true
    guardBoundary: MAX_BYTES,  // 1024
  };
}
