/**
 * Report Assembler — Phase 5
 * Assembles the three report types from ACEScore and NormalizedEvidence.
 *
 * CRITICAL RULE: The reporting engine is presentation-only.
 * It MUST NOT recompute scores, confidence, recommendations, weighting,
 * or run any metric/scoring/normalization logic.
 *
 * It only transforms existing outputs into report representations.
 *
 * ACE v1.2: When status is "insufficient_evidence" due to contamination:
 * - Do not show metric formulas, breakdowns, or recommendations
 * - Show contamination diagnostics prominently
 * - Show finalScore = null, confidence = null
 */

import type {
  ACEScore,
  AceEvidenceResult,
  NormalizedEvidenceResult,
  AceReport,
  DeveloperReport,
  AceSummaryReport,
  MetricReport,
  Recommendation,
  ContaminationDiagnosticsSummary,
} from "@/types";

import { buildVersionMetadata } from "./versionMetadataBuilder";
import { buildAllMetricReports } from "./metricReportBuilder";
import { getTopRecommendations, getSortedRecommendations } from "./recommendationEngine";
import { buildAbsenceEvidenceList } from "./absenceReportBuilder";
import { buildContaminationSummary } from "./contaminationReportBuilder";
import { buildReportDiagnostics } from "./reportDiagnostics";

/**
 * Assemble the full ACE Report (user-facing).
 * @param score The ACEScore from Phase 4.
 * @param normalized The NormalizedEvidenceResult from Phase 3.
 * @returns Complete AceReport.
 */
export function generateAceReport(
  score: ACEScore,
  normalized: NormalizedEvidenceResult,
): AceReport {
  const version = buildVersionMetadata(score.version);
  const contaminationSummary = buildContaminationSummary(score);

  // Convert weighting profile to Record<string, number>
  const weightingProfile: Record<string, number> = {};
  for (const [key, val] of Object.entries(score.weightingProfile)) {
    weightingProfile[key] = val;
  }

  // ─── ACE v1.2: Insufficient evidence due to contamination ──────────────
  // When status is "insufficient_evidence", do not show metric formulas,
  // breakdowns, or recommendations. Show contamination diagnostics prominently.
  if (score.status === "insufficient_evidence") {
    const contaminationDiagnostics = score.diagnostics.contamination
      ? getContaminationDiagnostics(normalized, score)
      : undefined;

    return {
      version,
      url: score.url,
      timestamp: score.timestamp,
      finalScore: null,
      confidence: null,
      status: "insufficient_evidence",
      metrics: {}, // No metric reports when insufficient
      weightingProfile,
      absenceEvidence: [],
      contamination: true,
      contaminationType: score.diagnostics.contaminationType ?? normalized.contaminationType,
      topRecommendations: [],
      contaminationDiagnostics,
    };
  }

  // ─── Normal scoring path ────────────────────────────────────────────────
  const metrics = buildAllMetricReports(score.metrics as unknown as Record<string, import("@/types").MetricScore>);
  const topRecommendations = getTopRecommendations(score, 10);
  const absenceEvidence = buildAbsenceEvidenceList(score);

  return {
    version,
    url: score.url,
    timestamp: score.timestamp,
    finalScore: score.finalScore,
    confidence: score.confidence,
    status: score.status,
    metrics,
    weightingProfile,
    absenceEvidence,
    contamination: contaminationSummary.hasContamination,
    contaminationType: contaminationSummary.type ?? undefined,
    topRecommendations,
  };
}

/**
 * Assemble the Developer Report (engineering-facing).
 * @param score The ACEScore from Phase 4.
 * @param normalized The NormalizedEvidenceResult from Phase 3.
 * @param evidence The raw AceEvidenceResult from Phase 2.
 * @returns Complete DeveloperReport.
 */
export function generateDeveloperReport(
  score: ACEScore,
  normalized: NormalizedEvidenceResult,
  evidence: AceEvidenceResult,
): DeveloperReport {
  const version = buildVersionMetadata(score.version);
  const diagnostics = buildReportDiagnostics(score, normalized);

  // Determine if scoring was skipped due to contamination
  const scoringSkipped = score.status === "insufficient_evidence" && score.diagnostics.contamination;
  const scoringSkipReason = scoringSkipped
    ? `Scoring blocked due to contamination: ${score.diagnostics.contaminationType ?? normalized.contaminationType ?? "unknown"}`
    : undefined;

  // Get contamination diagnostics from evidence
  const contaminationDiagnostics = evidence.diagnostics?.contaminationDiagnostics;

  return {
    version,
    url: score.url,
    timestamp: score.timestamp,
    evidence,
    normalized,
    score,
    diagnostics: {
      ...diagnostics,
      contaminationDiagnostics,
      scoringSkipped,
      scoringSkipReason,
    },
  };
}

/**
 * Assemble the Summary Report (lightweight).
 * @param score The ACEScore from Phase 4.
 * @returns Complete AceSummaryReport.
 */
export function generateSummaryReport(score: ACEScore): AceSummaryReport {
  const version = buildVersionMetadata(score.version);
  const topRecommendations = score.status === "insufficient_evidence" ? [] : getTopRecommendations(score, 5);
  const weaknesses = score.status === "insufficient_evidence"
    ? [`Scoring blocked: ${score.diagnostics.contaminationType ?? "contamination detected"}`]
    : collectAllWeaknesses(score);

  return {
    version,
    url: score.url,
    timestamp: score.timestamp,
    finalScore: score.finalScore,
    confidence: score.confidence,
    status: score.status,
    topRecommendations,
    weaknesses,
  };
}

/**
 * Generate all three reports from the same snapshot.
 * Ensures consistency across report types.
 * @param score The ACEScore from Phase 4.
 * @param normalized The NormalizedEvidenceResult from Phase 3.
 * @param evidence The raw AceEvidenceResult from Phase 2.
 * @returns Object with full, developer, and summary reports.
 */
export function generateReports(
  score: ACEScore,
  normalized: NormalizedEvidenceResult,
  evidence: AceEvidenceResult,
): {
  full: AceReport;
  developer: DeveloperReport;
  summary: AceSummaryReport;
} {
  return {
    full: generateAceReport(score, normalized),
    developer: generateDeveloperReport(score, normalized, evidence),
    summary: generateSummaryReport(score),
  };
}

/**
 * Get contamination diagnostics from evidence or normalized result.
 * @param normalized The normalized evidence result.
 * @param score The ACE score.
 * @returns ContaminationDiagnosticsSummary if available.
 */
function getContaminationDiagnostics(
  _normalized: NormalizedEvidenceResult,
  _score: ACEScore,
): ContaminationDiagnosticsSummary | undefined {
  // The contamination diagnostics are attached to the evidence result's diagnostics.
  // The developer report has access to the evidence directly.
  // For the AceReport, we return undefined here — the full diagnostics
  // are available in the developer report.
  return undefined;
}

/**
 * Collect all weaknesses from all metrics in deterministic order.
 * Deduplicates by string value.
 * @param score The ACEScore.
 * @returns Deduplicated, ordered weakness strings.
 */
function collectAllWeaknesses(score: ACEScore): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const metricKeys = [
    "readability", "structure", "clarity", "consistency",
    "semantic", "completeness", "semanticStructure", "structuredData",
    "extractability", "accessibility", "entityRecognition", "machineComprehension",
  ];

  for (const key of metricKeys) {
    const metric = score.metrics[key as keyof typeof score.metrics];
    if (metric) {
      for (const w of metric.weaknesses) {
        if (!seen.has(w)) {
          seen.add(w);
          result.push(w);
        }
      }
    }
  }

  return result;
}
