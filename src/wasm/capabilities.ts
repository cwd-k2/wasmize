import type { IRNode } from "./ir";
import type { FuncDef } from "./module";
import { visitChildren } from "./optimizer-passes";

// ── Feature types ───────────────────────────────────────────────────

export type WasmFeature =
  | "mvp"
  | "bulk-memory"
  | "multi-value"
  | "sign-extension"
  | "mutable-globals"
  | "simd"
  | "gc"
  | "tail-call"
  | "exception-handling"
  | "reference-types";

export interface FeatureSet {
  readonly features: ReadonlySet<WasmFeature>;
  has(feature: WasmFeature): boolean;
}

function featureSet(...features: WasmFeature[]): FeatureSet {
  const set: ReadonlySet<WasmFeature> = new Set(features);
  return {
    features: set,
    has(feature) { return set.has(feature); },
  };
}

/** Predefined feature sets for common targets. */
export const Features = {
  /** WebAssembly 1.0 baseline. */
  MVP: featureSet("mvp"),
  /** Common post-MVP features available in all modern runtimes. */
  Standard: featureSet("mvp", "bulk-memory", "multi-value", "sign-extension", "mutable-globals"),
  /** All features including proposals. */
  All: featureSet(
    "mvp", "bulk-memory", "multi-value", "sign-extension", "mutable-globals",
    "simd", "gc", "tail-call", "exception-handling", "reference-types",
  ),
} as const;

// ── IR Feature Scanner ──────────────────────────────────────────────

/**
 * Scans IR trees to detect which Wasm features are required.
 *
 * Currently wasmize only generates MVP instructions, so this returns `{"mvp"}`
 * for all programs. As new proposals are added (SIMD, bulk-memory, etc.),
 * this scanner will automatically detect them.
 */
export function scanFeatures(funcs: FuncDef[]): Set<WasmFeature> {
  const features = new Set<WasmFeature>(["mvp"]);

  function scanNode(node: IRNode): IRNode {
    // Future: detect post-MVP opcodes
    // e.g. bulk memory: memory.copy, memory.fill
    // e.g. SIMD: v128.*, i8x16.*, etc.
    // e.g. multi-value: multiple return values

    // For now, check for features based on IR node types
    // Currently all generated IR nodes are MVP-compatible

    // Mutable globals: detected from module-level (not IR), but
    // global_set implies mutable globals are being used
    if (node.op === "global_set") {
      features.add("mutable-globals");
    }

    // Recursively scan children
    visitChildren(node, scanNode);
    return node;
  }

  for (const func of funcs) {
    // Check multi-value: multiple return values
    if (func.results.length > 1) {
      features.add("multi-value");
    }

    for (const node of func.body) {
      scanNode(node);
    }
  }

  return features;
}

// ── Validation ──────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  required: Set<WasmFeature>;
  missing: WasmFeature[];
}

/**
 * Validates that a program's required features are supported by the target.
 */
export function validateFeatures(funcs: FuncDef[], target: FeatureSet): ValidationResult {
  const required = scanFeatures(funcs);
  const missing: WasmFeature[] = [];

  for (const feature of required) {
    if (!target.has(feature)) {
      missing.push(feature);
    }
  }

  return { valid: missing.length === 0, required, missing };
}
