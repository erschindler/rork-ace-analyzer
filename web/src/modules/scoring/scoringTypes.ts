/**
 * Scoring Internal Types — Phase 4 (ACE v1.2)
 * Internal types and utilities shared across metric calculators.
 */

import type {
  MetricScore,
  MetricCalculation,
  Recommendation,
  NormalizedEvidenceResult,
  NormalizedSection,
  NormalizedSignal,
} from "@/types";

/** Metric key identifiers matching the WeightingProfile keys. */
export type MetricKey =
  | "readability"
  | "structure"
  | "clarity"
  | "consistency"
  | "semantic"
  | "completeness"
  | "semanticStructure"
  | "structuredData"
  | "extractability"
  | "accessibility"
  | "entityRecognition"
  | "machineComprehension";

/** All 12 metric keys in deterministic order. */
export const METRIC_KEYS: MetricKey[] = [
  "readability",
  "structure",
  "clarity",
  "consistency",
  "semantic",
  "completeness",
  "semanticStructure",
  "structuredData",
  "extractability",
  "accessibility",
  "entityRecognition",
  "machineComprehension",
];

/** Human-readable names for each metric. */
export const METRIC_NAMES: Record<MetricKey, string> = {
  readability: "Readability",
  structure: "Structure",
  clarity: "Clarity",
  consistency: "Consistency",
  semantic: "Semantic",
  completeness: "Completeness",
  semanticStructure: "Semantic Structure",
  structuredData: "Structured Data",
  extractability: "Extractability",
  accessibility: "Accessibility",
  entityRecognition: "Entity Recognition",
  machineComprehension: "Machine Comprehension",
};

/** Context object passed to every metric calculator. */
export interface MetricContext {
  normalized: NormalizedEvidenceResult;
  /** Absence categories extracted from normalized absence sections. */
  absenceCategories: Set<string>;
  /** Critical absence categories. */
  criticalAbsence: string[];
  /** Contamination flags from normalized evidence. */
  contaminationFlags: string[];
  /** Whether evidence is contaminated. */
  isContaminated: boolean;
  /** Contamination type. */
  contaminationType: string | undefined;
  /** Normalization warnings passed through. */
  normalizationWarnings: string[];
}

/** Result of a metric calculator — before weighting is applied. */
export type MetricResult = MetricScore;

/** Create a "scored" metric result. */
export function createScoredResult(
  metric: string,
  score: number,
  confidence: number,
  evidence: string[],
  weaknesses: string[],
  recommendations: Recommendation[],
  calculation: MetricCalculation,
): MetricResult {
  return {
    metric,
    score: clampScore(score),
    confidence: clampConfidence(confidence),
    evidence,
    weaknesses,
    recommendations,
    status: "scored",
    calculation,
  };
}

/** Create an "insufficient_evidence" metric result. */
export function createInsufficientResult(
  metric: string,
  reason: string,
  calculationInputs: Record<string, unknown> = {},
): MetricResult {
  return {
    metric,
    score: null,
    confidence: null,
    evidence: [],
    weaknesses: [reason],
    recommendations: [],
    status: "insufficient_evidence",
    calculation: {
      inputs: calculationInputs,
      components: {},
      formula: "N/A — insufficient evidence",
      result: null,
    },
  };
}

/** Clamp a score to [0, 100]. */
export function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score * 100) / 100));
}

/** Clamp confidence to [0, 1]. */
export function clampConfidence(conf: number): number {
  return Math.max(0, Math.min(1, Math.round(conf * 10000) / 10000));
}

/** Extract all signals from an array of normalized sections. */
export function getAllSignals(sections: NormalizedSection[]): NormalizedSignal[] {
  return sections.flatMap((s) => s.normalizedSignals);
}

/** Find a summary signal (type ends with "_summary") from sections. */
export function findSummarySignal(sections: NormalizedSection[]): NormalizedSignal | null {
  for (const section of sections) {
    for (const sig of section.normalizedSignals) {
      if (sig.type.endsWith("_summary") || sig.type.endsWith("_assessment")) {
        return sig;
      }
    }
  }
  return null;
}

/** Get a numeric metadata field from a signal. */
export function getMetaNum(sig: NormalizedSignal | null, key: string): number | null {
  if (!sig || !sig.metadata) return null;
  const val = sig.metadata[key];
  if (typeof val === "number" && !Number.isNaN(val)) return val;
  return null;
}

/** Get a boolean metadata field from a signal. */
export function getMetaBool(sig: NormalizedSignal | null, key: string): boolean | null {
  if (!sig || !sig.metadata) return null;
  const val = sig.metadata[key];
  if (typeof val === "boolean") return val;
  return null;
}

/** Get a string metadata field from a signal. */
export function getMetaStr(sig: NormalizedSignal | null, key: string): string | null {
  if (!sig || !sig.metadata) return null;
  const val = sig.metadata[key];
  if (typeof val === "string") return val;
  return null;
}

/** Count total signals across sections. */
export function countTotalSignals(sections: NormalizedSection[]): number {
  return sections.reduce((sum, s) => sum + s.normalizedSignals.length, 0);
}

/** Count non-summary signals (excluding type ending with _summary or _assessment). */
export function countContentSignals(sections: NormalizedSection[]): number {
  return sections.reduce(
    (sum, s) =>
      sum +
      s.normalizedSignals.filter(
        (sig) => !sig.type.endsWith("_summary") && !sig.type.endsWith("_assessment"),
      ).length,
    0,
  );
}

/** Check if a specific absence category exists in the context. */
export function hasAbsence(ctx: MetricContext, category: string): boolean {
  return ctx.absenceCategories.has(category);
}

/** Compute a weighted average of numeric components. */
export function weightedSum(components: Record<string, number>, weights: Record<string, number>): number {
  let sum = 0;
  let totalWeight = 0;
  for (const [key, value] of Object.entries(components)) {
    const w = weights[key] ?? 0;
    sum += value * w;
    totalWeight += w;
  }
  return totalWeight > 0 ? sum / totalWeight : 0;
}

/** Apply contamination penalty to a score. */
export function applyContaminationPenalty(
  score: number,
  ctx: MetricContext,
  affectedFlags: string[],
): { score: number; penalty: number; flags: string[] } {
  if (!ctx.isContaminated) return { score, penalty: 0, flags: [] };

  const activeFlags = ctx.contaminationFlags.filter((f) => affectedFlags.includes(f));
  if (activeFlags.length === 0) {
    // Still apply a small penalty for any contamination
    return { score: score * 0.9, penalty: score * 0.1, flags: ctx.contaminationFlags };
  }

  // Critical flags reduce by 50%, warning flags by 20%
  let penaltyMultiplier = 0;
  for (const flag of activeFlags) {
    if (flag === "hydration_shell" || flag === "script_only_dom" || flag === "fetch_failure") {
      penaltyMultiplier = Math.max(penaltyMultiplier, 0.5);
    } else if (flag === "shadow_dom" || flag === "boilerplate_only" || flag === "malformed_dom") {
      penaltyMultiplier = Math.max(penaltyMultiplier, 0.2);
    } else {
      penaltyMultiplier = Math.max(penaltyMultiplier, 0.1);
    }
  }

  const penalty = score * penaltyMultiplier;
  return { score: score - penalty, penalty, flags: activeFlags };
}

/** Apply contamination penalty to confidence. */
export function applyContaminationConfidence(
  confidence: number,
  ctx: MetricContext,
): number {
  if (!ctx.isContaminated) return confidence;
  return confidence * 0.6;
}

/** Build a formula string from components and weights. */
export function buildFormula(
  componentNameWeights: Record<string, number>,
  result: number | null,
): string {
  const parts = Object.entries(componentNameWeights).map(
    ([key, weight]) => `${key}×${weight}`,
  );
  return `${parts.join(" + ")} = ${result !== null ? result.toFixed(2) : "null"}`;
}
