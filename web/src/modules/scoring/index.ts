/**
 * Scoring Module — Phase 4 (ACE v1.2)
 * Complete deterministic scoring engine with 12 metric calculators,
 * weighting engine, confidence model, recommendation framework,
 * diagnostics, and 3-state model.
 *
 * Public API:
 * - scoreNormalizedEvidence(normalized, customWeights?) — score pre-normalized evidence
 * - runAceScoringPipeline(evidence, customWeights?) — normalize + score in one call
 * - getAceScoreSummary(score) — quick metric score summary
 * - getGrade(score) — letter grade from numeric score
 *
 * Weighting:
 * - DEFAULT_WEIGHTS — ACE v1.2 default weighting profile
 * - validateWeightingProfile(profile) — validate a custom profile
 * - normalizeWeightingProfile(profile) — normalize weights to sum to 1.0
 * - getValidWeightingProfile(profile?) — get valid profile or fall back to default
 * - renormalizeForNullMetrics(profile, nullMetrics) — redistribute weights for null metrics
 *
 * Metric Calculators (in scoring/metricCalculators/):
 * - readability, structure, clarity, consistency, semantic, completeness,
 *   semanticStructure, structuredData, extractability, accessibility,
 *   entityRecognition, machineComprehension
 */

// ─── Pipeline (public API) ──────────────────────────────────────────
export {
  scoreNormalizedEvidence,
  runAceScoringPipeline,
  getAceScoreSummary,
  getGrade,
  SCORING_VERSION,
} from "./scoringPipeline";

// ─── Weighting Engine ───────────────────────────────────────────────
export {
  DEFAULT_WEIGHTS,
  WEIGHT_KEYS,
  validateWeightingProfile,
  normalizeWeightingProfile,
  getValidWeightingProfile,
  renormalizeForNullMetrics,
} from "./weights";

// ─── Recommendation Framework ───────────────────────────────────────
export { rec, REC_TEMPLATES } from "./recommendations";

// ─── Scoring Diagnostics ────────────────────────────────────────────
export { createScoringDiagnostics } from "./scoringDiagnostics";
export type { ScoringDiagnosticsCollector } from "./scoringDiagnostics";

// ─── Internal Types ─────────────────────────────────────────────────
export type {
  MetricKey,
  MetricContext,
  MetricResult,
} from "./scoringTypes";
export {
  METRIC_KEYS,
  METRIC_NAMES,
  createScoredResult,
  createInsufficientResult,
  clampScore,
  clampConfidence,
  getAllSignals,
  findSummarySignal,
  getMetaNum,
  getMetaBool,
  getMetaStr,
  countTotalSignals,
  countContentSignals,
  applyContaminationPenalty,
  applyContaminationConfidence,
  buildFormula,
} from "./scoringTypes";

// ─── Metric Calculators ─────────────────────────────────────────────
export { calculateReadability } from "./metricCalculators/readability";
export { calculateStructure } from "./metricCalculators/structure";
export { calculateClarity } from "./metricCalculators/clarity";
export { calculateConsistency } from "./metricCalculators/consistency";
export { calculateSemantic } from "./metricCalculators/semantic";
export { calculateCompleteness } from "./metricCalculators/completeness";
export { calculateSemanticStructure } from "./metricCalculators/semanticStructure";
export { calculateStructuredData } from "./metricCalculators/structuredData";
export { calculateExtractability } from "./metricCalculators/extractability";
export { calculateAccessibility } from "./metricCalculators/accessibility";
export { calculateEntityRecognition } from "./metricCalculators/entityRecognition";
export { calculateMachineComprehension } from "./metricCalculators/machineComprehension";
