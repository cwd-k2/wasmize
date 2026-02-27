import { describe, test, expect } from "vitest";
import { DiagnosticCollector, type Diagnostic } from "../dsl/diagnostics";
import { compile, compileWithDiagnostics } from "../dsl/interpreter";
import { Type, Mod } from "../dsl/primitives";
import { instantiate } from "../runtime/instantiate";

describe("DiagnosticCollector", () => {
  test("collects errors, warnings, and info", () => {
    const collector = new DiagnosticCollector();

    collector.add({ level: "error", code: "V-01", message: "error msg" });
    collector.add({ level: "warning", code: "V-02", message: "warn msg" });
    collector.add({ level: "info", code: "V-03", message: "info msg" });

    expect(collector.all).toHaveLength(3);
    expect(collector.errors).toHaveLength(1);
    expect(collector.warnings).toHaveLength(1);
    expect(collector.hasErrors).toBe(true);
  });

  test("hasErrors is false when no errors", () => {
    const collector = new DiagnosticCollector();
    collector.add({ level: "warning", code: "W-01", message: "just a warning" });
    expect(collector.hasErrors).toBe(false);
  });

  test("strict mode promotes warnings to errors", () => {
    const collector = new DiagnosticCollector({ strict: true });
    collector.add({ level: "warning", code: "V-01", message: "promoted" });

    expect(collector.warnings).toHaveLength(0);
    expect(collector.errors).toHaveLength(1);
    expect(collector.errors[0]!.level).toBe("error");
    expect(collector.hasErrors).toBe(true);
  });

  test("warnings: false suppresses warnings", () => {
    const collector = new DiagnosticCollector({ warnings: false });
    collector.add({ level: "warning", code: "V-01", message: "suppressed" });
    collector.add({ level: "error", code: "V-02", message: "kept" });

    expect(collector.all).toHaveLength(1);
    expect(collector.all[0]!.level).toBe("error");
  });

  test("preserves location info", () => {
    const collector = new DiagnosticCollector();
    const diag: Diagnostic = {
      level: "error",
      code: "V-05",
      message: "type mismatch",
      location: { func: "add", stmt: 3 },
    };
    collector.add(diag);

    expect(collector.all[0]!.location).toEqual({ func: "add", stmt: 3 });
  });
});

describe("compileWithDiagnostics", () => {
  test("returns binary and empty diagnostics for valid program", async () => {
    const result = compileWithDiagnostics(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });

    expect(result.binary).toBeInstanceOf(Uint8Array);
    expect(result.diagnostics).toHaveLength(0);

    const { exports } = await instantiate(result.binary!);
    expect((exports as { add(a: number, b: number): number }).add(1, 2)).toBe(3);
  });

  test("returns diagnostics without binary on compilation error", () => {
    const result = compileWithDiagnostics(function* () {
      // Throw during interpretation to simulate a compile error
      throw new Error("intentional compile error");
    });

    expect(result.binary).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.level).toBe("error");
    expect(result.diagnostics[0]!.code).toBe("COMPILE");
    expect(result.diagnostics[0]!.message).toContain("intentional compile error");
  });

  test("strict mode promotes warnings to errors in compileWithDiagnostics", () => {
    // compileWithDiagnostics itself doesn't emit warnings yet,
    // but the collector is configured correctly for future V-xx passes
    const collector = new DiagnosticCollector({ strict: true });
    collector.add({ level: "warning", code: "V-99", message: "test warning" });
    expect(collector.errors).toHaveLength(1);
    expect(collector.errors[0]!.message).toBe("test warning");
  });
});

describe("compile with diagnostic options", () => {
  test("compile still works without diagnostic options", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("id", { n: Type.i32 }, function* (n) {
        return n;
      });
    });

    expect(binary).toBeInstanceOf(Uint8Array);
    const { exports } = await instantiate(binary);
    expect((exports as { id(n: number): number }).id(42)).toBe(42);
  });

  test("compile with diagnostics: true still returns binary for valid program", () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("id", { n: Type.i32 }, function* (n) {
        return n;
      });
    }, { diagnostics: true });

    expect(binary).toBeInstanceOf(Uint8Array);
  });
});
