/**
 * Scoring Pipeline Orchestrator — Phase 4 (ACE v1.2)
 *
 * Pipeline:
 * 1. Normalize evidence (Phase 3)
 * 2. Run all 12 metric calculators
 * 3. Apply weighting
 * 4. Compute final score (MCR)
 * 5. Compute confidence
 * 6. Produce diagnostics
 * 7. Return complete ACEScore
 *
 * Never throws — always returns a complete ACEScore object.
 */

import type {
  AceEvidenceResult,
  NormalizedEvidenceResult,
  ACEScore,
  MetricScore,
  WeightingProfile,
  ScoringVersion,
} from "@/types";

import { normalizeEvidence, getCriticalAbsence } from "@/modules/normalization";
import { isCriticalContamination } from "@/modules/normalization/contaminationNormalizer";

import {
  DEFAULT_WEIGHTS,
  getValidWeightingProfile,
  renormalizeForNullMetrics,
  WEIGHT_KEYS,
} from "./weights";
import { createScoringDiagnostics } from "./scoringDiagnostics";
import {
  type MetricContext,
  type MetricKey,
  METRIC_NAMES,
} from "./scoringTypes";

import { calculateReadability } from "./metricCalculators/readability";
import { calculateStructure } from "./metricCalculators/structure";
import { calculateClarity } from "./metricCalculators/clarity";
import { calculateConsistency } from "./metricCalculators/consistency";
import { calculateSemantic } from "./metricCalculators/semantic";
import { calculateCompleteness } from "./metricCalculators/completeness";
import { calculateSemanticStructure } from "./metricCalculators/semanticStructure";
import { calculateStructuredData } from "./metricCalculators/structuredData";
import { calculateExtractability } from "./metricCalculators/extractability";
import { calculateAccessibility } from "./metricCalculators/accessibility";
import { calculateEntityRecognition } from "./metricCalculators/entityRecognition";
import { calculateMachineComprehension } from "./metricCalculators/machineComprehension";

/** ACE v1.2 version metadata. */
export const SCORING_VERSION: ScoringVersion = {
  scoring: "1.2.0",
  metrics: "1.2.0",
  weighting: "1.2.0",
  normalization: "1.2.0",
  evidence: "1.2.0",
};

/** Critical absence categories that trigger absence dominance. */
const CRITICAL_ABSENCE_FLAGS = [
  "main_landmark",
  "primary_heading",
  "fetch_failure",
];

/**
 * Score normalized evidence using the ACE v1.2 scoring engine.
 *
 * ACE v1.2 3-State Model:
 * If normalized.contamination is true AND contamination is critical,
 * the scoring engine immediately returns:
 *   status = "insufficient_evidence"
 *   finalScore = null
 *   confidence = null
 *   metrics = {} (empty)
 *   diagnostics.contamination = true
 *   diagnostics.contaminationType = normalized.contaminationType
 * Metric calculators do NOT run when contamination is present.
 *
 * @param normalized Normalized evidence result from Phase 3.
 * @param customWeights Optional custom weighting profile.
 * @returns Complete ACEScore object.
 */
export function scoreNormalizedEvidence(
  normalized: NormalizedEvidenceResult,
  customWeights?: Partial<WeightingProfile>,
): ACEScore {
  const diagnostics = createScoringDiagnostics();

  // Set normalization warnings in diagnostics
  diagnostics.setNormalizationWarnings(normalized.normalizationWarnings);
  diagnostics.setContamination(normalized.contamination, normalized.contaminationType);

  // ─── ACE v1.2: Block scoring when CRITICAL contamination is present ──────────
  // Only critical contamination types (fetch_failure, hydration_shell,
  // script_only_dom, dom_corruption, invalid_url, unsupported_protocol)
  // block scoring entirely. Non-critical contamination (shadow_dom,
  // malformed_dom, boilerplate_only, encoding_failure, oversized_html)
  // still allows scoring but reduces confidence.
  if (normalized.contamination && isCriticalContamination(normalized.contaminationType)) {
    diagnostics.addScoringWarning(
      `Scoring blocked due to critical contamination: ${normalized.contaminationType ?? "unknown"}`,
    );
    return createContaminatedScore(normalized, customWeights, diagnostics);
  }

  // Build metric context
  const ctx = buildMetricContext(normalized, diagnostics);

  // Get valid weighting profile
  const weights = getValidWeightingProfile(customWeights);

  // Run all 12 metric calculators in deterministic order
  const metricResults: Record<string, MetricScore> = {};

  const calculators: Array<{ key: MetricKey; fn: (ctx: MetricContext) => MetricScore }> = [
    { key: "readability", fn: calculateReadability },
    { key: "structure", fn: calculateStructure },
    { key: "clarity", fn: calculateClarity },
    { key: "consistency", fn: calculateConsistency },
    { key: "semantic", fn: calculateSemantic },
    { key: "completeness", fn: calculateCompleteness },
    { key: "semanticStructure", fn: calculateSemanticStructure },
    { key: "structuredData", fn: calculateStructuredData },
    { key: "extractability", fn: calculateExtractability },
    { key: "accessibility", fn: calculateAccessibility },
    { key: "entityRecognition", fn: calculateEntityRecognition },
    { key: "machineComprehension", fn: calculateMachineComprehension },
  ];

  for (const { key, fn } of calculators) {
    try {
      const result = fn(ctx);
      metricResults[key] = result;

      // Record diagnostics for insufficient evidence
      if (result.status === "insufficient_evidence") {
        diagnostics.addMissingEvidence(key, result.weaknesses[0] ?? "insufficient evidence");
      }

      // Record absence evidence mappings
      for (const weakness of result.weaknesses) {
        if (weakness.startsWith("Absence:")) {
          diagnostics.addAbsenceEvidence(key, weakness);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown scoring error";
      diagnostics.addScoringWarning(`Metric ${key} failed: ${msg}`);
      metricResults[key] = {
        metric: key,
        score: null,
        confidence: null,
        evidence: [],
        weaknesses: [`Metric calculator error: ${msg}`],
        recommendations: [],
        status: "insufficient_evidence",
        calculation: {
          inputs: { error: msg },
          components: {},
          formula: "N/A — calculator error",
          result: null,
        },
      };
    }
  }

  // Determine null metrics for weight renormalization
  const nullMetrics = new Set<string>();
  for (const key of WEIGHT_KEYS) {
    if (metricResults[key]?.score === null) {
      nullMetrics.add(key);
    }
  }

  // Renormalize weights for null metrics
  const renormalizedWeights = renormalizeForNullMetrics(weights, nullMetrics);

  // Compute final score (MCR) and confidence
  let finalScore = 0;
  let totalActiveWeight = 0;
  let finalConfidence = 0;

  for (const key of WEIGHT_KEYS) {
    const metric = metricResults[key];
    if (metric && metric.score !== null && metric.confidence !== null) {
      const weight = renormalizedWeights[key as keyof WeightingProfile];
      finalScore += metric.score * weight;
      finalConfidence += metric.confidence * weight;
      totalActiveWeight += weight;
    }
  }

  // If all metrics are null, result is insufficient
  if (totalActiveWeight === 0) {
    return createInsufficientScore(normalized.url, weights, metricResults, diagnostics);
  }

  // Round final score and confidence
  finalScore = Math.round(finalScore * 100) / 100;
  finalConfidence = Math.round(finalConfidence * 10000) / 10000;

  // Check for absence evidence dominance
  const { isAbsenceDominated, absenceReason } = checkAbsenceDominance(ctx, finalScore);

  let status: ACEScore["status"];
  if (isAbsenceDominated) {
    status = "scored_absence_evidence";
    finalScore = 0;
    finalConfidence = 0.2;
    diagnostics.addScoringWarning(`Absence evidence dominance: ${absenceReason}`);
  } else {
    status = "scored";
  }

  // Adjust confidence for contamination
  if (ctx.isContaminated && !isAbsenceDominated) {
    finalConfidence = Math.round(finalConfidence * 0.7 * 10000) / 10000;
  }

  // Build and return the complete ACEScore
  return {
    version: { ...SCORING_VERSION },
    timestamp: Date.now(),
    url: normalized.url,
    finalScore,
    confidence: finalConfidence,
    metrics: {
      readability: metricResults.readability,
      structure: metricResults.structure,
      clarity: metricResults.clarity,
      consistency: metricResults.consistency,
      semantic: metricResults.semantic,
      completeness: metricResults.completeness,
      semanticStructure: metricResults.semanticStructure,
      structuredData: metricResults.structuredData,
      extractability: metricResults.extractability,
      accessibility: metricResults.accessibility,
      entityRecognition: metricResults.entityRecognition,
      machineComprehension: metricResults.machineComprehension,
    },
    weightingProfile: weights,
    status,
    diagnostics: diagnostics.build(),
  };
}

/**
 * Run the full ACE scoring pipeline from raw evidence.
 * Normalizes evidence first (Phase 3), then scores (Phase 4).
 * @param evidence Raw evidence from Phase 2.
 * @param customWeights Optional custom weighting profile.
 * @returns Complete ACEScore object.
 */
export function runAceScoringPipeline(
  evidence: AceEvidenceResult,
  customWeights?: Partial<WeightingProfile>,
): ACEScore {
  // Step 1: Normalize evidence
  const normalized = normalizeEvidence(evidence);

  // Step 2: Score normalized evidence
  return scoreNormalizedEvidence(normalized, customWeights);
}

/**
 * Get a summary of ACE score metrics for quick display.
 * @param score The ACE score result.
 * @returns Object with metric keys and their scores.
 */
export function getAceScoreSummary(score: ACEScore): Record<string, number | null> {
  const summary: Record<string, number | null> = {};
  for (const key of WEIGHT_KEYS) {
    const metric = score.metrics[key as keyof typeof score.metrics];
    summary[key] = metric?.score ?? null;
  }
  summary.finalScore = score.finalScore;
  summary.confidence = score.confidence;
  return summary;
}

/**
 * Get a letter grade from a numeric score.
 * @param score Numeric score 0-100.
 * @returns Letter grade A-F.
 */
export function getGrade(score: number | null): string {
  if (score === null) return "N/A";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Build the metric context from normalized evidence.
 */
function buildMetricContext(
  normalized: NormalizedEvidenceResult,
  diagnostics: ReturnType<typeof createScoringDiagnostics>,
): MetricContext {
  // Extract absence categories
  const absenceCategories = new Set<string>();
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      const category = (sig.metadata?.category as string) ?? sig.type;
      if (category && category !== "absence_summary") {
        absenceCategories.add(category);
      }
    }
  }

  // Extract critical absence
  const criticalAbsence = getCriticalAbsence(normalized.absence);

  // Extract contamination flags from normalized evidence
  const contaminationFlags: string[] = [];
  if (normalized.contamination && normalized.contaminationType) {
    contaminationFlags.push(normalized.contaminationType);
  }
  // Also check for contamination signals in absence sections
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "contamination" && sig.metadata?.contaminationType) {
        contaminationFlags.push(sig.metadata.contaminationType as string);
      }
    }
  }

  return {
    normalized,
    absenceCategories,
    criticalAbsence,
    contaminationFlags: [...new Set(contaminationFlags)],
    isContaminated: normalized.contamination,
    contaminationType: normalized.contaminationType,
    normalizationWarnings: normalized.normalizationWarnings,
  };
}

/**
 * Check if absence evidence dominates the score.
 * Absence dominates when:
 * - absencePenalty >= evidenceScoreContribution
 * - OR any critical absence flags exist (no main content, no headings, fetch failure)
 */
function checkAbsenceDominance(
  ctx: MetricContext,
  finalScore: number,
): { isAbsenceDominated: boolean; absenceReason: string } {
  // Check for critical absence flags
  for (const criticalFlag of CRITICAL_ABSENCE_FLAGS) {
    if (ctx.absenceCategories.has(criticalFlag)) {
      return {
        isAbsenceDominated: true,
        absenceReason: `Critical absence: ${criticalFlag}`,
      };
    }
  }

  // Check if critical absence from the normalizer
  if (ctx.criticalAbsence.length > 0) {
    const hasCritical = ctx.criticalAbsence.some((c) =>
      CRITICAL_ABSENCE_FLAGS.includes(c),
    );
    if (hasCritical) {
      return {
        isAbsenceDominated: true,
        absenceReason: `Critical absence detected: ${ctx.criticalAbsence.join(", ")}`,
      };
    }
  }

  // Check if absence count dominates — many missing elements relative to score
  const absenceCount = ctx.absenceCategories.size;
  if (absenceCount >= 8 && finalScore < 30) {
    return {
      isAbsenceDominated: true,
      absenceReason: `${absenceCount} missing elements with low evidence score (${finalScore.toFixed(1)})`,
    };
  }

  return { isAbsenceDominated: false, absenceReason: "" };
}

/**
 * Create an insufficient evidence ACEScore.
 */
function createInsufficientScore(
  url: string,
  weights: WeightingProfile,
  metricResults: Record<string, MetricScore>,
  diagnostics: ReturnType<typeof createScoringDiagnostics>,
): ACEScore {
  return {
    version: { ...SCORING_VERSION },
    timestamp: Date.now(),
    url,
    finalScore: null,
    confidence: null,
    metrics: {
      readability: metricResults.readability,
      structure: metricResults.structure,
      clarity: metricResults.clarity,
      consistency: metricResults.consistency,
      semantic: metricResults.semantic,
      completeness: metricResults.completeness,
      semanticStructure: metricResults.semanticStructure,
      structuredData: metricResults.structuredData,
      extractability: metricResults.extractability,
      accessibility: metricResults.accessibility,
      entityRecognition: metricResults.entityRecognition,
      machineComprehension: metricResults.machineComprehension,
    },
    weightingProfile: weights,
    status: "insufficient_evidence",
    diagnostics: diagnostics.build(),
  };
}

/**
 * Create a contaminated ACEScore — ACE v1.2 insufficient evidence due to contamination.
 * All metric calculators are skipped. metrics is empty.
 * @param normalized The contaminated normalized evidence.
 * @param customWeights Optional custom weights (still included in weighting profile).
 * @param diagnostics Scoring diagnostics collector.
 * @returns ACEScore with status="insufficient_evidence" and empty metrics.
 */
function createContaminatedScore(
  normalized: NormalizedEvidenceResult,
  customWeights: Partial<WeightingProfile> | undefined,
  diagnostics: ReturnType<typeof createScoringDiagnostics>,
): ACEScore {
  const weights = getValidWeightingProfile(customWeights);

  return {
    version: { ...SCORING_VERSION },
    timestamp: Date.now(),
    url: normalized.url,
    finalScore: null,
    confidence: null,
    metrics: {} as ACEScore["metrics"],
    weightingProfile: weights,
    status: "insufficient_evidence",
    diagnostics: diagnostics.build(),
  };
}
