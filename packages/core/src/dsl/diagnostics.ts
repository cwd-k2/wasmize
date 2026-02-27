/**
 * Unified Diagnostic API for compile-time validation.
 *
 * Provides structured diagnostic collection used by all V-xx validation items.
 * Diagnostics are collected during compilation instead of throwing on first error.
 *
 * @module
 */

/** Severity level of a diagnostic. */
export type DiagnosticLevel = "error" | "warning" | "info";

/** A structured diagnostic emitted during compilation. */
export interface Diagnostic {
  level: DiagnosticLevel;
  /** Machine-readable code (e.g. "V-01", "V-02"). */
  code: string;
  /** Human-readable description. */
  message: string;
  /** Optional source location. */
  location?: { func?: string; stmt?: number };
}

/** Options controlling diagnostic behavior during compilation. */
export interface DiagnosticOptions {
  /** Collect diagnostics instead of throwing on first error. */
  diagnostics?: boolean;
  /** Promote warnings to errors. */
  strict?: boolean;
  /** Include warnings in output (default: true). */
  warnings?: boolean;
}

/**
 * Collects diagnostics during compilation.
 *
 * Used internally by the compiler and validation passes to accumulate
 * errors, warnings, and info messages.
 */
export class DiagnosticCollector {
  private _items: Diagnostic[] = [];
  private _strict: boolean;
  private _warnings: boolean;

  constructor(options?: { strict?: boolean; warnings?: boolean }) {
    this._strict = options?.strict ?? false;
    this._warnings = options?.warnings ?? true;
  }

  /** Add a diagnostic. Promotes warnings to errors if strict mode is enabled. */
  add(diag: Diagnostic): void {
    let adjusted = diag;
    if (diag.level === "warning") {
      if (!this._warnings) return;
      if (this._strict) {
        adjusted = { ...diag, level: "error" };
      }
    }
    this._items.push(adjusted);
  }

  /** All collected diagnostics. */
  get all(): readonly Diagnostic[] {
    return this._items;
  }

  /** Only error-level diagnostics. */
  get errors(): readonly Diagnostic[] {
    return this._items.filter((d) => d.level === "error");
  }

  /** Only warning-level diagnostics. */
  get warnings(): readonly Diagnostic[] {
    return this._items.filter((d) => d.level === "warning");
  }

  /** Whether any error-level diagnostics have been collected. */
  get hasErrors(): boolean {
    return this._items.some((d) => d.level === "error");
  }
}
