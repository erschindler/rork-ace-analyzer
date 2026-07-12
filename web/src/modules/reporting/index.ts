/**
 * Reporting Module — Phase 5 (ACE v1.2)
 * Complete reporting engine: presentation-only, deterministic, versioned.
 *
 * Public API:
 * - generateAceReport(score, normalized) — full user-facing ACE report
 * - generateDeveloperReport(score, normalized, evidence) — engineering-facing report
 * - generateSummaryReport(score) — lightweight summary report
 * - generateReports(score, normalized, evidence) — all three from same snapshot
 *
 * Version Metadata:
 * - buildVersionMetadata() — builds AceVersionMetadata
 * - REPORTING_VERSION, SCHEMA_VERSION
 *
 * Metric Reports:
 * - buildMetricReport(key, metric) — convert single MetricScore to MetricReport
 * - buildAllMetricReports(metrics) — convert all metrics
 *
 * Recommendation Engine:
 * - getTopRecommendations(score, n) — top N deterministic recommendations
 * - getSortedRecommendations(score) — full sorted list
 * - collectAllRecommendations(score) — raw collection
 * - deduplicateRecommendations(recs) — dedup by (category, message)
 * - sortRecommendations(recs) — deterministic sort
 *
 * Absence Reporting:
 * - buildAbsenceEvidenceList(score) — from scoring diagnostics
 * - buildAbsenceDescriptions(normalized) — readable text
 * - mapAbsenceToMetrics(score) — absence → affected metrics
 * - getAbsenceCategories(normalized) — unique categories
 *
 * Contamination Reporting:
 * - buildContaminationSummary(score) — summary object
 * - buildContaminationFlagList(normalized) — flag list
 * - buildContaminationImpactList(normalized) — detailed impact
 *
 * Diagnostics:
 * - buildReportDiagnostics(score, normalized) — preserved diagnostics
 */

// ─── Report Assembler (public API) ──────────────────────────────────
export {
  generateAceReport,
  generateDeveloperReport,
  generateSummaryReport,
  generateReports,
} from "./reportAssembler";

// ─── Version Metadata ────────────────────────────────────────────────
export {
  buildVersionMetadata,
  REPORTING_VERSION,
  SCHEMA_VERSION,
} from "./versionMetadataBuilder";

// ─── Metric Report Builder ───────────────────────────────────────────
export {
  buildMetricReport,
  buildAllMetricReports,
  getOrderedMetricKeys,
} from "./metricReportBuilder";

// ─── Recommendation Engine ───────────────────────────────────────────
export {
  collectAllRecommendations,
  deduplicateRecommendations,
  sortRecommendations,
  getSortedRecommendations,
  getTopRecommendations,
} from "./recommendationEngine";

// ─── Absence Report Builder ──────────────────────────────────────────
export {
  buildAbsenceEvidenceList,
  buildAbsenceDescriptions,
  mapAbsenceToMetrics,
  getAbsenceCategories,
  countAbsenceSignals,
} from "./absenceReportBuilder";

// ─── Contamination Report Builder ────────────────────────────────────
export {
  buildContaminationSummary,
  buildContaminationFlagList,
  buildContaminationImpactList,
} from "./contaminationReportBuilder";

// ─── Report Diagnostics ──────────────────────────────────────────────
export { buildReportDiagnostics } from "./reportDiagnostics";
