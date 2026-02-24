import { describe, test, expect } from "vitest";
import { wasmize } from "../declarative";

describe("wasmize", () => {
  test("simple function without layout", async () => {
    const mod = await wasmize({
      functions: {
        add: {
          params: { a: "i32", b: "i32" },
          body: function* (a, b) {
            return yield* a.add(b);
          },
        },
      },
    });
    expect(mod.exports.add(3, 4)).toBe(7);
  });

  test("multiple functions", async () => {
    const mod = await wasmize({
      functions: {
        add: {
          params: { a: "i32", b: "i32" },
          body: function* (a, b) {
            return yield* a.add(b);
          },
        },
        mul: {
          params: { a: "i32", b: "i32" },
          body: function* (a, b) {
            return yield* a.mul(b);
          },
        },
      },
    });
    expect(mod.exports.add(3, 4)).toBe(7);
    expect(mod.exports.mul(3, 4)).toBe(12);
  });

  test("layout with i32 array", async () => {
    const mod = await wasmize({
      layout: {
        data: { type: "i32", count: 10 },
      },
      functions: {
        noop: {
          params: {},
          body: function* () {},
        },
      },
    });
    // TypedArray view into Wasm memory
    expect(mod.layout.data).toBeInstanceOf(Int32Array);
    expect(mod.layout.data.length).toBe(10);

    // Write via layout, verify it works
    mod.layout.data.set([10, 20, 30]);
    expect(mod.layout.data[0]).toBe(10);
    expect(mod.layout.data[1]).toBe(20);
    expect(mod.layout.data[2]).toBe(30);
  });

  test("layout with f64 array", async () => {
    const mod = await wasmize({
      layout: {
        values: { type: "f64", count: 5 },
      },
      functions: {
        noop: {
          params: {},
          body: function* () {},
        },
      },
    });
    expect(mod.layout.values).toBeInstanceOf(Float64Array);
    mod.layout.values.set([1.5, 2.7, 3.14]);
    expect(mod.layout.values[0]).toBeCloseTo(1.5);
    expect(mod.layout.values[2]).toBeCloseTo(3.14);
  });

  test("custom memory pages", async () => {
    const mod = await wasmize({
      memory: { pages: 2 },
      functions: {
        noop: {
          params: {},
          body: function* () {},
        },
      },
    });
    // Should have at least 2 pages (128KB)
    const memory = mod.instance.exports.memory as WebAssembly.Memory;
    expect(memory.buffer.byteLength).toBeGreaterThanOrEqual(2 * 65536);
  });
});
