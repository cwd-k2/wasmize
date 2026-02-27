import { describe, test, expect, vi } from "vitest";
import { IR } from "../wasm/ir";
import type { FuncDef } from "../wasm/module";
import { detectDeadCode, formatDeadCode } from "../wasm/dead-code";
import { assertNoTraps, assertTraps, getLastAssertionError } from "../runtime/assertions";
import { mockImports } from "../runtime/mock";
import { dumpMemory, snapshotMemory, diffMemory, formatDiff } from "../runtime/debug-utils";
import { writeImageData, readImageData, syncCanvas } from "../runtime/canvas";
import { compile } from "../dsl/compiler";
import { Type, Mod, Mem, Ctrl } from "../dsl/primitives";
import { instantiate } from "../runtime/instantiate";

// ── T-01: Dead Code Detection ──────────────────────────────────────

describe("T-01: Dead Code Detection", () => {
  test("detects dead code after return", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32"],
        body: [
          IR.return_(IR.const_i32(42)),
          IR.local_set(0, IR.const_i32(99)), // dead
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(1);
    expect(results[0]!.funcIndex).toBe(0);
    expect(results[0]!.stmtIndex).toBe(1);
    expect(results[0]!.reason).toBe("after-return");
  });

  test("detects dead code after br", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: [],
        body: [
          IR.block([
            IR.br(0),
            IR.local_set(0, IR.const_i32(1)), // dead
          ]),
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(1);
    expect(results[0]!.reason).toBe("after-br");
  });

  test("detects dead code after unreachable", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: [],
        body: [
          IR.unreachable(),
          IR.const_i32(0), // dead
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(1);
    expect(results[0]!.reason).toBe("after-unreachable");
  });

  test("detects dead code after if where both branches terminate", () => {
    const funcs: FuncDef[] = [
      {
        params: ["i32"],
        results: ["i32"],
        body: [
          IR.if_then_else(
            IR.local_get(0),
            [IR.return_(IR.const_i32(1))],
            [IR.return_(IR.const_i32(2))],
          ),
          IR.const_i32(99), // dead — both branches returned
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(1);
    expect(results[0]!.reason).toBe("after-terminating-if");
  });

  test("no dead code in normal function", () => {
    const funcs: FuncDef[] = [
      {
        params: ["i32"],
        results: ["i32"],
        body: [
          IR.local_set(0, IR.binop("add", IR.local_get(0), IR.const_i32(1))),
          IR.local_get(0),
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(0);
  });

  test("detects dead code in multiple functions", () => {
    const funcs: FuncDef[] = [
      {
        params: [],
        results: ["i32"],
        body: [IR.return_(IR.const_i32(1)), IR.const_i32(2)],
      },
      {
        params: [],
        results: [],
        body: [IR.nop()], // no dead code
      },
      {
        params: [],
        results: [],
        body: [IR.unreachable(), IR.nop()],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(2);
    expect(results[0]!.funcIndex).toBe(0);
    expect(results[1]!.funcIndex).toBe(2);
  });

  test("no false positive when if has else without terminator", () => {
    const funcs: FuncDef[] = [
      {
        params: ["i32"],
        results: ["i32"],
        body: [
          IR.if_then_else(
            IR.local_get(0),
            [IR.return_(IR.const_i32(1))],
            [IR.local_set(0, IR.const_i32(2))], // does NOT terminate
          ),
          IR.local_get(0), // reachable
        ],
      },
    ];
    const results = detectDeadCode(funcs);
    expect(results).toHaveLength(0);
  });

  test("formatDeadCode produces readable output", () => {
    const results = detectDeadCode([
      {
        params: [],
        results: ["i32"],
        body: [IR.return_(IR.const_i32(1)), IR.const_i32(2)],
      },
    ]);
    const text = formatDeadCode(results);
    expect(text).toContain("Dead code detected");
    expect(text).toContain("func[0]");
    expect(text).toContain("after return statement");
  });

  test("formatDeadCode with no dead code", () => {
    expect(formatDeadCode([])).toBe("No dead code detected.");
  });
});

// ── T-04: Wasm Assertion Helper ────────────────────────────────────

describe("T-04: Wasm Assertion Helper", () => {
  test("assertNoTraps succeeds for non-trapping function", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("add", { a: Type.i32, b: Type.i32 }, function* (a, b) {
        return yield* a.add(b);
      });
    });
    const { exports } = await instantiate(binary);
    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    const retVal = assertNoTraps(instance, "add", [3, 4]);
    expect(retVal).toBe(7);
  });

  test("assertNoTraps throws for trapping function", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("trap", function* () {
        yield* Ctrl.unreachable();
      });
    });
    const { exports } = await instantiate(binary);
    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    expect(() => assertNoTraps(instance, "trap")).toThrow("Expected \"trap\" not to trap");
  });

  test("assertTraps succeeds when function traps", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("trap", function* () {
        yield* Ctrl.unreachable();
      });
    });
    const { exports } = await instantiate(binary);
    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    // Should not throw
    assertTraps(instance, "trap");
  });

  test("assertTraps throws when function does not trap", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("ok", function* () {
        return 42;
      });
    });
    const { exports } = await instantiate(binary);
    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    expect(() => assertTraps(instance, "ok")).toThrow("Expected \"ok\" to trap");
  });

  test("assertNoTraps throws for missing export", async () => {
    const binary = compile(function* () {
      yield* Mod.exportFunc("x", function* () {
        return 0;
      });
    });
    const { exports } = await instantiate(binary);
    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    expect(() => assertNoTraps(instance, "missing")).toThrow('Export "missing" is not a function');
  });

  test("getLastAssertionError reads memory offset 0", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("setError", { code: Type.i32 }, function* (code) {
        yield* Mem.store(0, code);
      });
    });
    const { exports } = await instantiate(binary);
    const setError = exports.setError as Function;

    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    // Initially 0
    expect(getLastAssertionError(instance)).toBe(0);

    // Set error code
    setError(42);
    expect(getLastAssertionError(instance)).toBe(42);
  });
});

// ── R-03: Import Mock Framework ────────────────────────────────────

describe("R-03: Import Mock Framework", () => {
  test("auto-generates mocks for all imports", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const env = yield* Mod.importGroup("env", {
        log: { params: ["i32"], results: [] },
        getValue: { params: [], results: ["i32"] },
      });

      yield* Mod.exportFunc("run", function* () {
        yield* env.log.void(42);
        return yield* env.getValue();
      });
    });

    const mocks = mockImports(binary);
    expect(mocks).toHaveProperty("env");
    const envMock = mocks.env as Record<string, Function>;
    expect(typeof envMock.log).toBe("function");
    expect(typeof envMock.getValue).toBe("function");

    // Auto-generated void function should be a no-op
    expect(envMock.log!(42)).toBeUndefined();
    // Auto-generated i32 function should return 0
    expect(envMock.getValue!()).toBe(0);

    // Should be able to instantiate with auto-mocks
    const { exports } = await instantiate(binary, mocks);
    const run = exports.run as Function;
    expect(run()).toBe(0);
  });

  test("overrides take precedence over auto-mocks", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const env = yield* Mod.importGroup("env", {
        log: { params: ["i32"], results: [] },
        getValue: { params: [], results: ["i32"] },
      });

      yield* Mod.exportFunc("run", function* () {
        yield* env.log.void(42);
        return yield* env.getValue();
      });
    });

    const logFn = vi.fn();
    const mocks = mockImports(binary, {
      env: { log: logFn, getValue: () => 99 },
    });

    const { exports } = await instantiate(binary, mocks);
    const run = exports.run as Function;

    expect(run()).toBe(99);
    expect(logFn).toHaveBeenCalledWith(42);
  });

  test("partial overrides fill remaining with auto-mocks", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);

      const env = yield* Mod.importGroup("env", {
        log: { params: ["i32"], results: [] },
        getValue: { params: [], results: ["i32"] },
      });

      yield* Mod.exportFunc("run", function* () {
        yield* env.log.void(42);
        return yield* env.getValue();
      });
    });

    const logFn = vi.fn();
    const mocks = mockImports(binary, { env: { log: logFn } });

    const { exports } = await instantiate(binary, mocks);
    const run = exports.run as Function;

    // getValue is auto-mocked to return 0
    expect(run()).toBe(0);
    expect(logFn).toHaveBeenCalledWith(42);
  });
});

// ── R-04: Memory Dump / State Snapshot ─────────────────────────────

describe("R-04: Memory Dump / State Snapshot", () => {
  test("dumpMemory produces hex + ASCII output", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("write", function* () {
        // Store 0x48656C6C at offset 0 ("Hell")
        yield* Mem.store(0, 0x6c6c6548);
        // Store 0x6F at offset 4 ("o")
        yield* Mem.store8(4, 0x6f);
      });
    });
    const { exports } = await instantiate(binary);
    const write = exports.write as Function;
    write();

    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };
    const dump = dumpMemory(instance, 0, 16);
    expect(dump).toContain("48 65 6c 6c 6f");
    expect(dump).toContain("|Hello");
  });

  test("snapshotMemory copies memory region", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("write", function* () {
        yield* Mem.store(0, 0x01020304);
      });
    });
    const { exports } = await instantiate(binary);
    const write = exports.write as Function;
    write();

    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };
    const snap = snapshotMemory(instance, 0, 4);
    expect(snap).toBeInstanceOf(Uint8Array);
    expect(snap.length).toBe(4);
    // Little-endian: 0x01020304 => [04, 03, 02, 01]
    expect(snap[0]).toBe(0x04);
    expect(snap[1]).toBe(0x03);
    expect(snap[2]).toBe(0x02);
    expect(snap[3]).toBe(0x01);
  });

  test("diffMemory detects differences", () => {
    const a = new Uint8Array([1, 2, 3, 4]);
    const b = new Uint8Array([1, 9, 3, 8]);
    const diffs = diffMemory(a, b);
    expect(diffs).toHaveLength(2);
    expect(diffs[0]).toEqual({ offset: 1, a: 2, b: 9 });
    expect(diffs[1]).toEqual({ offset: 3, a: 4, b: 8 });
  });

  test("diffMemory returns empty for identical snapshots", () => {
    const a = new Uint8Array([1, 2, 3]);
    const b = new Uint8Array([1, 2, 3]);
    expect(diffMemory(a, b)).toHaveLength(0);
  });

  test("diffMemory throws on length mismatch", () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([1, 2, 3]);
    expect(() => diffMemory(a, b)).toThrow("length mismatch");
  });

  test("formatDiff produces readable output", () => {
    const diffs = [{ offset: 0x10, a: 0xaa, b: 0xbb }];
    const text = formatDiff(diffs);
    expect(text).toContain("1 byte differ");
    expect(text).toContain("0x0010");
    expect(text).toContain("0xaa");
    expect(text).toContain("0xbb");
  });

  test("formatDiff with no diffs", () => {
    expect(formatDiff([])).toBe("No differences.");
  });

  test("snapshot + diff round-trip", async () => {
    const binary = compile(function* () {
      yield* Mod.memory(1);
      yield* Mod.exportFunc("write", { offset: Type.i32, val: Type.i32 }, function* (offset, val) {
        yield* Mem.store(offset, val);
      });
    });
    const { exports } = await instantiate(binary);
    const write = exports.write as Function;

    const instance = { exports: exports as Record<string, unknown> & { memory?: WebAssembly.Memory } };

    // Take snapshot before
    const before = snapshotMemory(instance, 0, 8);

    // Modify memory
    write(0, 0xdeadbeef);

    // Take snapshot after
    const after = snapshotMemory(instance, 0, 8);

    // Diff
    const diffs = diffMemory(before, after);
    expect(diffs.length).toBeGreaterThan(0);
    // First 4 bytes changed (little-endian 0xDEADBEEF)
    expect(diffs[0]!.offset).toBe(0);
  });
});

// ── R-05: Canvas Pixel Sync Helper ─────────────────────────────────

describe("R-05: Canvas Pixel Sync Helper", () => {
  test("writeImageData copies pixels into Wasm memory", () => {
    const wasmMemory = new Uint8Array(256);
    const imageData = {
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 128]),
      width: 2,
      height: 1,
    };

    writeImageData(wasmMemory, 16, imageData);

    // Check at offset 16
    expect(wasmMemory[16]).toBe(255); // R
    expect(wasmMemory[17]).toBe(0); // G
    expect(wasmMemory[18]).toBe(0); // B
    expect(wasmMemory[19]).toBe(255); // A
    expect(wasmMemory[20]).toBe(0); // R
    expect(wasmMemory[21]).toBe(255); // G
    expect(wasmMemory[22]).toBe(0); // B
    expect(wasmMemory[23]).toBe(128); // A
  });

  test("readImageData reads pixels from Wasm memory", () => {
    const wasmMemory = new Uint8Array(256);
    // Write 2x1 RGBA pixels at offset 0
    wasmMemory.set([100, 150, 200, 255, 50, 75, 100, 128], 0);

    const result = readImageData(wasmMemory, 0, 2, 1);
    expect(result.width).toBe(2);
    expect(result.height).toBe(1);
    expect(result.data.length).toBe(8); // 2*1*4
    expect(result.data[0]).toBe(100);
    expect(result.data[4]).toBe(50);
  });

  test("round-trip write then read preserves data", () => {
    const wasmMemory = new Uint8Array(256);
    const original = {
      data: new Uint8ClampedArray([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120]),
      width: 3,
      height: 1,
    };

    writeImageData(wasmMemory, 32, original);
    const result = readImageData(wasmMemory, 32, 3, 1);

    expect(result.data).toEqual(original.data);
    expect(result.width).toBe(original.width);
    expect(result.height).toBe(original.height);
  });

  test("syncCanvas reads from memory and calls putImageData", () => {
    const wasmMemory = new Uint8Array(256);
    wasmMemory.set([255, 128, 64, 255], 0); // 1 pixel

    const putImageDataSpy = vi.fn();
    const ctx = { putImageData: putImageDataSpy };

    syncCanvas(ctx, wasmMemory, 0, 1, 1);

    expect(putImageDataSpy).toHaveBeenCalledTimes(1);
    const call = putImageDataSpy.mock.calls[0]!;
    expect(call[1]).toBe(0); // x
    expect(call[2]).toBe(0); // y
    const imageData = call[0] as { data: Uint8ClampedArray; width: number; height: number };
    expect(imageData.width).toBe(1);
    expect(imageData.height).toBe(1);
    expect(imageData.data[0]).toBe(255);
    expect(imageData.data[1]).toBe(128);
    expect(imageData.data[2]).toBe(64);
    expect(imageData.data[3]).toBe(255);
  });

  test("2D image round-trip with offset", () => {
    const wasmMemory = new Uint8Array(512);
    const width = 4;
    const height = 2;
    const offset = 64;

    // Create a 4x2 image with distinct pixel values
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 256;
    }
    const imageData = { data, width, height };

    writeImageData(wasmMemory, offset, imageData);
    const result = readImageData(wasmMemory, offset, width, height);

    expect(result.data).toEqual(data);
  });

  test("readImageData returns independent copy", () => {
    const wasmMemory = new Uint8Array(256);
    wasmMemory.set([1, 2, 3, 4], 0);

    const result = readImageData(wasmMemory, 0, 1, 1);

    // Modify original memory
    wasmMemory[0] = 99;

    // Result should be unchanged
    expect(result.data[0]).toBe(1);
  });
});
