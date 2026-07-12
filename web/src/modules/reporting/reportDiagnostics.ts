/**
 * Report Diagnostics — Phase 5
 * Collects diagnostics from normalization and scoring phases into a unified structure.
 *
 * CRITICAL RULE: Diagnostics must be PRESERVED EXACTLY as produced by Phase 3/4.
 * This module MUST NOT modify, filter, or alter any diagnostic data.
 *
 * ACE v1.2: When status is "insufficient_evidence" due to contamination,
 * pipeline warnings prominently note that scoring was blocked.
 */

import type { ACEScore, NormalizedEvidenceResult, DeveloperReport } from "@/types";

/**
 * Build the diagnostics section for a DeveloperReport.
 * Preserves normalization warnings, scoring warnings, and collects pipeline warnings.
 *
 * Pipeline warnings are derived from structural issues (not from scoring) — they
 * capture meta-level concerns like "no evidence was produced" or "contamination
 * affected scoring." They do NOT modify the original diagnostics.
 *
 * @param score The ACEScore from Phase 4.
 * @param normalized The NormalizedEvidenceResult from Phase 3.
 * @returns Diagnostics object with all warnings preserved exactly.
 */
export function buildReportDiagnostics(
  score: ACEScore,
  normalized: NormalizedEvidenceResult,
): DeveloperReport["diagnostics"] {
  // Preserve normalization warnings exactly as-is
  const normalizationWarnings: string[] = [...normalized.normalizationWarnings];

  // Preserve scoring warnings exactly as-is
  const scoringWarnings: string[] = [...score.diagnostics.scoringWarnings];

  // Collect pipeline-level warnings (meta-level, not from scoring)
  const pipelineWarnings: string[] = [];

  // Pipeline warning: insufficient evidence status
  if (score.status === "insufficient_evidence") {
    if (score.diagnostics.contamination) {
      pipelineWarnings.push(
        `Scoring BLOCKED due to contamination: ${score.diagnostics.contaminationType ?? "unknown"}. All metric calculators were skipped. finalScore=null, confidence=null.`,
      );
    } else {
      pipelineWarnings.push("Pipeline result: insufficient evidence — final score is null");
    }
  }

  // Pipeline warning: absence dominance
  if (score.status === "scored_absence_evidence") {
    pipelineWarnings.push("Pipeline result: absence evidence dominance — final score set to 0");
  }

  // Pipeline warning: contamination affected scoring (non-blocking)
  if (score.diagnostics.contamination && score.status !== "insufficient_evidence") {
    pipelineWarnings.push(
      `Pipeline warning: contamination (${score.diagnostics.contaminationType ?? "unknown"}) affected scoring confidence`,
    );
  }

  // Pipeline warning: missing evidence metrics
  if (score.diagnostics.missingEvidence.length > 0) {
    pipelineWarnings.push(
      `Pipeline warning: ${score.diagnostics.missingEvidence.length} metric(s) had insufficient evidence`,
    );
  }

  // Pipeline warning: normalization errors
  if (normalized.normalizationErrors.length > 0) {
    for (const err of normalized.normalizationErrors) {
      pipelineWarnings.push(`Normalization error: ${err}`);
    }
  }

  return {
    normalizationWarnings,
    scoringWarnings,
    pipelineWarnings,
    scoringSkipped: score.status === "insufficient_evidence" && score.diagnostics.contamination,
    scoringSkipReason:
      score.status === "insufficient_evidence" && score.diagnostics.contamination
        ? `Scoring blocked due to contamination: ${score.diagnostics.contaminationType ?? "unknown"}`
        : undefined,
  };
}
