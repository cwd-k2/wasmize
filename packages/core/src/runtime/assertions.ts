/**
 * Wasm runtime assertion helpers for testing.
 *
 * Provides `assertNoTraps` (expect a function to succeed),
 * `assertTraps` (expect a function to trap), and `getLastAssertionError`
 * (read the last assertion error code from Wasm memory offset 0).
 *
 * These work with any Wasm instance — no special DSL compilation required.
 *
 * @module
 */

type WasmExports = Record<string, unknown> & { memory?: WebAssembly.Memory };

/**
 * Calls the exported function and asserts that it does NOT trap.
 * Returns the function's return value on success, throws if a trap occurs.
 */
export function assertNoTraps(
  instance: { exports: WasmExports },
  fnName: string,
  args: unknown[] = [],
): unknown {
  const fn = instance.exports[fnName];
  if (typeof fn !== "function") {
    throw new Error(`Export "${fnName}" is not a function`);
  }
  try {
    return fn(...args);
  } catch (e) {
    throw new Error(
      `Expected "${fnName}" not to trap, but it did: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Calls the exported function and asserts that it DOES trap.
 * Throws if the function returns successfully.
 */
export function assertTraps(
  instance: { exports: WasmExports },
  fnName: string,
  args: unknown[] = [],
): void {
  const fn = instance.exports[fnName];
  if (typeof fn !== "function") {
    throw new Error(`Export "${fnName}" is not a function`);
  }
  try {
    fn(...args);
  } catch {
    // Expected — trap occurred
    return;
  }
  throw new Error(`Expected "${fnName}" to trap, but it returned successfully`);
}

/**
 * Reads the i32 value at memory offset 0 as a "last assertion error code".
 * Convention: 0 means no error, non-zero is an error code.
 *
 * Useful when Wasm code writes error codes to memory offset 0 (e.g., via
 * a Ctrl.assert-style pattern that stores error info before trapping).
 */
export function getLastAssertionError(
  instance: { exports: WasmExports },
): number {
  const memory = instance.exports.memory;
  if (!memory) {
    throw new Error("Instance has no exported memory");
  }
  const view = new Int32Array(memory.buffer);
  return view[0]!;
}
