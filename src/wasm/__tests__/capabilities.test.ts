import { describe, test, expect } from "vitest";
import { IR, type IRNode } from "../ir";
import type { FuncDef } from "../module";
import type { WasmValType } from "../opcodes";
import {
  scanFeatures,
  validateFeatures,
  Features,
  describeFeature,
  suggestTarget,
  customFeatureSet,
  type WasmFeature,
} from "../capabilities";

function makeFuncs(...bodies: { body: IRNode[]; results?: WasmValType[] }[]): FuncDef[] {
  return bodies.map((b) => ({
    params: [],
    results: b.results || [],
    locals: [],
    body: b.body,
  }));
}

describe("scanFeatures", () => {
  test("MVP program returns only mvp", () => {
    const funcs = makeFuncs({
      body: [IR.binop("add", IR.local_get(0), IR.const_i32(1))],
    });
    const features = scanFeatures(funcs as any);
    expect(features).toEqual(new Set(["mvp"]));
  });

  test("empty program returns mvp", () => {
    const features = scanFeatures([]);
    expect(features).toEqual(new Set(["mvp"]));
  });

  test("global_set adds mutable-globals", () => {
    const funcs = makeFuncs({
      body: [IR.global_set(0, IR.const_i32(42))],
    });
    const features = scanFeatures(funcs as any);
    expect(features.has("mutable-globals")).toBe(true);
    expect(features.has("mvp")).toBe(true);
  });

  test("nested global_set is detected", () => {
    const funcs = makeFuncs({
      body: [IR.if_then_else(IR.const_i32(1), [IR.global_set(0, IR.const_i32(1))], [], "void")],
    });
    const features = scanFeatures(funcs as any);
    expect(features.has("mutable-globals")).toBe(true);
  });

  test("multi-value detected from multiple results", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32", "i32"],
        locals: [],
        body: [IR.const_i32(1), IR.const_i32(2)],
      },
    ];
    const features = scanFeatures(funcs);
    expect(features.has("multi-value")).toBe(true);
  });

  test("single result does not add multi-value", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32"],
        locals: [],
        body: [IR.const_i32(42)],
      },
    ];
    const features = scanFeatures(funcs);
    expect(features.has("multi-value")).toBe(false);
  });

  test("scans all functions", () => {
    const funcs: FuncDef[] = [
      { params: [], results: [], locals: [], body: [IR.const_i32(1)] },
      { params: [], results: [], locals: [], body: [IR.global_set(0, IR.const_i32(2))] },
    ];
    const features = scanFeatures(funcs);
    expect(features.has("mutable-globals")).toBe(true);
  });

  test("call_indirect adds reference-types", () => {
    const funcs = makeFuncs({
      body: [IR.call_indirect(0, 0, [IR.const_i32(1)], IR.const_i32(0))],
    });
    const features = scanFeatures(funcs as any);
    expect(features.has("reference-types")).toBe(true);
  });

  test("nested call_indirect is detected", () => {
    const funcs = makeFuncs({
      body: [
        IR.if_then_else(
          IR.const_i32(1),
          [IR.drop(IR.call_indirect(0, 0, [], IR.const_i32(0)))],
          [],
          "void",
        ),
      ],
    });
    const features = scanFeatures(funcs as any);
    expect(features.has("reference-types")).toBe(true);
  });
});

describe("validateFeatures", () => {
  test("MVP program validates against MVP target", () => {
    const funcs: FuncDef[] = [
      {
        params: ["i32"],
        results: ["i32"],
        locals: [],
        body: [IR.binop("add", IR.local_get(0), IR.const_i32(1))],
      },
    ];
    const result = validateFeatures(funcs, Features.MVP);
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  test("mutable-globals program fails against MVP", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: [],
        locals: [],
        body: [IR.global_set(0, IR.const_i32(42))],
      },
    ];
    const result = validateFeatures(funcs, Features.MVP);
    expect(result.valid).toBe(false);
    expect(result.missing).toContain("mutable-globals");
  });

  test("mutable-globals program passes against Standard", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: [],
        locals: [],
        body: [IR.global_set(0, IR.const_i32(42))],
      },
    ];
    const result = validateFeatures(funcs, Features.Standard);
    expect(result.valid).toBe(true);
  });

  test("validates against All target", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32", "i32"],
        locals: [],
        body: [IR.global_set(0, IR.const_i32(1)), IR.const_i32(1), IR.const_i32(2)],
      },
    ];
    const result = validateFeatures(funcs, Features.All);
    expect(result.valid).toBe(true);
  });

  test("required features are reported", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32", "i32"],
        locals: [],
        body: [IR.global_set(0, IR.const_i32(1)), IR.const_i32(1), IR.const_i32(2)],
      },
    ];
    const result = validateFeatures(funcs, Features.All);
    expect(result.required.has("mvp")).toBe(true);
    expect(result.required.has("mutable-globals")).toBe(true);
    expect(result.required.has("multi-value")).toBe(true);
  });
});

describe("Features presets", () => {
  test("MVP has only mvp", () => {
    expect(Features.MVP.has("mvp")).toBe(true);
    expect(Features.MVP.has("bulk-memory")).toBe(false);
    expect(Features.MVP.features.size).toBe(1);
  });

  test("Standard has expected features", () => {
    expect(Features.Standard.has("mvp")).toBe(true);
    expect(Features.Standard.has("bulk-memory")).toBe(true);
    expect(Features.Standard.has("multi-value")).toBe(true);
    expect(Features.Standard.has("sign-extension")).toBe(true);
    expect(Features.Standard.has("mutable-globals")).toBe(true);
    expect(Features.Standard.has("simd")).toBe(false);
    expect(Features.Standard.features.size).toBe(5);
  });

  test("All includes everything", () => {
    const allFeatures: WasmFeature[] = [
      "mvp",
      "bulk-memory",
      "multi-value",
      "sign-extension",
      "mutable-globals",
      "simd",
      "gc",
      "tail-call",
      "exception-handling",
      "reference-types",
    ];
    for (const f of allFeatures) {
      expect(Features.All.has(f)).toBe(true);
    }
    expect(Features.All.features.size).toBe(10);
  });
});

describe("describeFeature", () => {
  test("returns description for each feature", () => {
    expect(describeFeature("mvp")).toContain("baseline");
    expect(describeFeature("mutable-globals")).toContain("Chrome 74+");
    expect(describeFeature("reference-types")).toContain("funcref");
  });
});

describe("suggestTarget", () => {
  test("suggests MVP for simple program", () => {
    const funcs = makeFuncs({ body: [IR.const_i32(42)] });
    const result = suggestTarget(funcs as any);
    expect(result.name).toBe("MVP");
  });

  test("suggests Standard for mutable-globals", () => {
    const funcs = makeFuncs({ body: [IR.global_set(0, IR.const_i32(1))] });
    const result = suggestTarget(funcs as any);
    expect(result.name).toBe("Standard");
  });

  test("suggests All for reference-types", () => {
    const funcs = makeFuncs({
      body: [IR.call_indirect(0, 0, [IR.const_i32(1)], IR.const_i32(0))],
    });
    const result = suggestTarget(funcs as any);
    expect(result.name).toBe("All");
  });
});

describe("customFeatureSet", () => {
  test("creates feature set with specified features", () => {
    const fs = customFeatureSet("mvp", "simd");
    expect(fs.has("mvp")).toBe(true);
    expect(fs.has("simd")).toBe(true);
    expect(fs.has("gc")).toBe(false);
    expect(fs.features.size).toBe(2);
  });
});

describe("compile with target", () => {
  test("MVP target accepts MVP program", async () => {
    const { compile } = await import("../../dsl/compiler");
    const { Mod, Mem } = await import("../../dsl/primitives");

    expect(() => {
      compile(
        function* () {
          yield* Mod.memory(1);
          yield* Mod.exportFunc("val", {}, function* () {
            return yield* Mem.i32(42);
          });
        },
        { target: Features.MVP },
      );
    }).not.toThrow();
  });

  test("compile without target always succeeds", async () => {
    const { compile } = await import("../../dsl/compiler");
    const { Mod, Mem } = await import("../../dsl/primitives");

    expect(() => {
      compile(function* () {
        yield* Mod.memory(1);
        yield* Mod.exportFunc("val", {}, function* () {
          return yield* Mem.i32(42);
        });
      });
    }).not.toThrow();
  });

  test("error message includes feature description and suggestion", async () => {
    const { compile } = await import("../../dsl/compiler");
    const { Mod, Mem, Type } = await import("../../dsl/primitives");

    expect(() => {
      compile(
        function* () {
          yield* Mod.memory(1);
          const g = yield* Mod.global(Type.i32, 0);
          yield* Mod.exportFunc("test", {}, function* () {
            yield* g.set(yield* Mem.i32(1));
            return yield* g.get();
          });
        },
        { target: Features.MVP },
      );
    }).toThrow(/Suggested target: Features\.Standard/);
  });
});
