/**
 * Re-exports optimizer passes and capability tracking utilities.
 *
 * @module
 */
// Optimizer passes
export {
  type OptimizerPass,
  type OptimizerConfig,
  builtinPasses,
  createOptimizer,
  withoutPasses,
  visitChildren,
} from "./wasm/optimizer-passes";

// Capability tracking
export {
  type WasmFeature,
  type FeatureSet,
  type ValidationResult,
  Features,
  customFeatureSet,
  describeFeature,
  scanFeatures,
  validateFeatures,
  suggestTarget,
} from "./wasm/capabilities";
