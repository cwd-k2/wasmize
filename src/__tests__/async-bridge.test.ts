import { describe, test, expect } from "vitest";
import { compile } from "../dsl/compiler";
import { Type, Mod, Mem, Ctrl, Op } from "../dsl/primitives";
import { AsyncBridge } from "../runtime/async-bridge";

describe("AsyncBridge", () => {
  test("handles a single effect and continues", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("compute", { x: Type.i32 }, function* (x) {
        // Phase 0: request effect
        yield* Ctrl.when(Mem.load(12).eq(0), function* () {
          yield* Ctrl.effect(1, x);
        });
        // Phase 1: read response from mem[8]
        return yield* Mem.load(8);
      });
    });

    const bridge = new AsyncBridge(binary);
    bridge.on(1, async (payload) => payload * 2);

    const result = await (bridge as any).run("compute", 21);
    expect(result).toBe(42);
  });

  test("handles multiple sequential effects", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      yield* Mod.exportFunc("multi", { x: Type.i32 }, function* (x) {
        // Phase 0: first effect
        yield* Ctrl.when(Mem.load(12).eq(0), function* () {
          yield* Ctrl.effect(1, x);
        });
        // Phase 1: save first response, request second effect
        yield* Ctrl.when(Mem.load(12).eq(1), function* () {
          yield* Mem.store(100, Mem.load(8));
          yield* Ctrl.effect(2, Mem.load(8));
        });
        // Phase 2: combine saved + second response
        return yield* Op.add(Mem.load(100), Mem.load(8));
      });
    });

    const bridge = new AsyncBridge(binary);
    bridge.on(1, async (payload) => payload + 10);
    bridge.on(2, async (payload) => payload * 3);

    const result = await (bridge as any).run("multi", 5);
    // Phase 0: effect(1, 5) → 15 written to mem[8]
    // Phase 1: effect(2, 15) → 45 written to mem[8]
    // Result: mem[100](15) + mem[8](45) = 60
    expect(result).toBe(60);
  });

  test("throws on unregistered effect tag", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("fail", function* () {
        yield* Ctrl.effect(99, 0);
        return 0;
      });
    });

    const bridge = new AsyncBridge(binary);
    await expect((bridge as any).run("fail")).rejects.toThrow(
      "No handler registered for effect tag 99",
    );
  });

  test("works with no effects (direct return)", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });

    const bridge = new AsyncBridge(binary);
    const result = await (bridge as any).run("add", 3, 4);
    expect(result).toBe(7);
  });
});
