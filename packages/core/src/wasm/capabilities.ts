/**
 * Wasm feature scanning and target validation.
 *
 * Scans compiled IR to detect which Wasm features are required
 * (mutable-globals, multi-value, sign-extension, reference-types, etc.)
 * and validates against a target {@link FeatureSet}. Provides preset
 * feature sets ({@link Features}.MVP/Standard/All) and utilities for
 * suggesting the minimal required target.
 *
 * @module
 */
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
    has(feature) {
      return set.has(feature);
    },
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
  ),
} as const;

/** Creates a custom FeatureSet from individual features. */
export function customFeatureSet(...features: WasmFeature[]): FeatureSet {
  return featureSet(...features);
}

// ── Feature descriptions ────────────────────────────────────────────

const featureDescriptions: Record<WasmFeature, string> = {
  mvp: "WebAssembly 1.0 baseline (all browsers)",
  "bulk-memory":
    "Bulk memory operations (memory.copy, memory.fill) — Chrome 75+, Firefox 79+, Safari 15+",
  "multi-value":
    "Multiple return values from functions/blocks — Chrome 85+, Firefox 78+, Safari 15+",
  "sign-extension":
    "Sign-extension operators (i32.extend8_s, etc.) — Chrome 74+, Firefox 62+, Safari 14.1+",
  "mutable-globals":
    "Mutable global variables (import/export) — Chrome 74+, Firefox 61+, Safari 13.1+",
  simd: "128-bit SIMD operations — Chrome 91+, Firefox 89+, Safari 16.4+",
  gc: "Garbage collection (struct/array types) — Chrome 119+, Firefox 120+",
  "tail-call": "Tail call optimization — Chrome 112+, Firefox 121+, Safari 15+",
  "exception-handling": "Try/catch exception handling — Chrome 95+, Firefox 100+, Safari 15.2+",
  "reference-types": "Reference types (funcref, externref) — Chrome 96+, Firefox 79+, Safari 15+",
};

/** Returns a human-readable description of a feature including browser support. */
export function describeFeature(feature: WasmFeature): string {
  return featureDescriptions[feature];
}

// ── Sign-extension convert kinds ────────────────────────────────────

const signExtensionKinds = new Set([
  "i32_extend8_s",
  "i32_extend16_s",
  "i64_extend8_s",
  "i64_extend16_s",
  "i64_extend32_s",
]);

// ── IR Feature Scanner ──────────────────────────────────────────────

/**
 * Scans IR trees to detect which Wasm features are required.
 */
export function scanFeatures(funcs: FuncDef[]): Set<WasmFeature> {
  const features = new Set<WasmFeature>(["mvp"]);

  function scanNode(node: IRNode): IRNode {
    // Mutable globals
    if (node.op === "global_set") {
      features.add("mutable-globals");
    }

    // Sign-extension: convert nodes with sign-extension kinds
    if (node.op === "convert" && signExtensionKinds.has(node.kind)) {
      features.add("sign-extension");
    }

    // Reference types: call_indirect uses funcref table
    if (node.op === "call_indirect") {
      features.add("reference-types");
    }

    // Bulk memory: memory.copy, memory.fill
    if (node.op === "memory_copy" || node.op === "memory_fill") {
      features.add("bulk-memory");
    }

    visitChildren(node, scanNode);
    return node;
  }

  for (const func of funcs) {
    // Multi-value: multiple return values
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

// ── Utilities ───────────────────────────────────────────────────────

/** Preset ordering for suggestTarget comparison. */
const presets: { name: string; set: FeatureSet }[] = [
  { name: "MVP", set: Features.MVP },
  { name: "Standard", set: Features.Standard },
  { name: "All", set: Features.All },
];

/**
 * Suggests the smallest predefined FeatureSet that supports all required features.
 * Returns preset name and FeatureSet.
 */
export function suggestTarget(funcs: FuncDef[]): { name: string; target: FeatureSet } {
  const required = scanFeatures(funcs);
  for (const preset of presets) {
    const allSupported = [...required].every((f) => preset.set.has(f));
    if (allSupported) {
      return { name: preset.name, target: preset.set };
    }
  }
  return { name: "All", target: Features.All };
}
