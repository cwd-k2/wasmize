import type { FuncGen, VoidStmt } from "./types";
import { type ExprInput, ChainableExpr, resolve } from "./expr";

/** Converts ExprInput to Expr by wrapping through resolve(). */
function asExpr(input: ExprInput): FuncGen<import("./types").WasmVal> {
  return resolve(input);
}

/**
 * Compile-time macro helpers for the Generator DSL.
 *
 * All helpers expand at JS evaluation time — the generated Wasm
 * contains no trace of Meta. Use inside `() => [...]` array bodies
 * where JS `for` loops are not available.
 */
export const Meta = {
  /**
   * Compile-time iteration. Expands `body(item, index)` for each element.
   *
   * @example
   * ```ts
   * Meta.each([0, 1, 2], (c) => [
   *   Mem.store8(offset.add(c), gray),
   * ])
   * ```
   */
  each<T>(items: readonly T[], body: (item: T, index: number) => VoidStmt[]): FuncGen<void> {
    return (function* () {
      for (let i = 0; i < items.length; i++) {
        const stmts = body(items[i]!, i);
        for (const s of stmts) yield* s;
      }
    })();
  },

  /**
   * Compile-time N-fold expansion. Expands `body(0), body(1), ..., body(n-1)`.
   *
   * @example
   * ```ts
   * Meta.times(4, (i) => [
   *   Mem.store(i * 4, value),
   * ])
   * ```
   */
  times(n: number, body: (index: number) => VoidStmt[]): FuncGen<void> {
    return (function* () {
      for (let i = 0; i < n; i++) {
        const stmts = body(i);
        for (const s of stmts) yield* s;
      }
    })();
  },

  /**
   * Compile-time conditional. Emits zero instructions when `condition` is falsy.
   *
   * @example
   * ```ts
   * Meta.when(USE_ALPHA, () => [
   *   Mem.store8(offset.add(3), alpha),
   * ])
   * ```
   */
  when(condition: boolean, body: () => VoidStmt[]): FuncGen<void> {
    return (function* () {
      if (condition) {
        const stmts = body();
        for (const s of stmts) yield* s;
      }
    })();
  },

  /**
   * Reduces N expressions with addition. `sum([a, b, c])` → `a + b + c`.
   *
   * @example
   * ```ts
   * Meta.sum([r.mul(77), g.mul(150), b.mul(29)])
   * ```
   */
  sum(exprs: ExprInput[]): ChainableExpr {
    if (exprs.length === 0) return new ChainableExpr(0);
    let acc = new ChainableExpr(asExpr(exprs[0]!));
    for (let i = 1; i < exprs.length; i++) {
      acc = acc.add(exprs[i]!);
    }
    return acc;
  },

  /**
   * Reduces N expressions with multiplication. `product([a, b, c])` → `a * b * c`.
   */
  product(exprs: ExprInput[]): ChainableExpr {
    if (exprs.length === 0) return new ChainableExpr(1);
    let acc = new ChainableExpr(asExpr(exprs[0]!));
    for (let i = 1; i < exprs.length; i++) {
      acc = acc.mul(exprs[i]!);
    }
    return acc;
  },

  /**
   * Weighted sum. `weightedSum([{weight:77,expr:r},{weight:150,expr:g}])` → `r*77 + g*150`.
   *
   * Zero-weight terms are skipped entirely (no Wasm instructions emitted).
   *
   * @example
   * ```ts
   * // ITU-R BT.601 grayscale
   * Meta.weightedSum([
   *   { weight: 77, expr: r },
   *   { weight: 150, expr: g },
   *   { weight: 29, expr: b },
   * ]).shr(8)
   * ```
   */
  weightedSum(items: { weight: number; expr: ExprInput }[]): ChainableExpr {
    const nonZero = items.filter((it) => it.weight !== 0);
    if (nonZero.length === 0) return new ChainableExpr(0);

    const terms: ChainableExpr[] = nonZero.map((it) =>
      it.weight === 1
        ? new ChainableExpr(asExpr(it.expr))
        : new ChainableExpr(asExpr(it.expr)).mul(it.weight),
    );

    let acc = terms[0]!;
    for (let i = 1; i < terms.length; i++) {
      acc = acc.add(terms[i]!);
    }
    return acc;
  },

  /** 4-directional offsets: Right, Left, Down, Up. */
  neighbors4: [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ] as const,

  /** 8-directional offsets (excludes center). */
  neighbors8: [
    { dx: -1, dy: -1 },
    { dx: -1, dy: 0 },
    { dx: -1, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: 1, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: 1, dy: 1 },
  ] as const,
};
