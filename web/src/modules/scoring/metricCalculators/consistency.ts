/**
 * Consistency Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: headings, paragraphs, semantic
 * Formula: weightedSum(headingConsistencyScore, terminologyScore, toneConsistencyScore, formatConsistencyScore)
 * Contamination impact: malformed_dom, encoding_failure reduce score.
 */

import type { MetricResult } from "../scoringTypes";
import {
  createScoredResult,
  createInsufficientResult,
  clampScore,
  applyContaminationPenalty,
  applyContaminationConfidence,
  buildFormula,
  getAllSignals,
  countContentSignals,
  type MetricContext,
} from "../scoringTypes";
import { rec } from "../recommendations";

/** Weights for consistency components. */
const COMPONENT_WEIGHTS = {
  headingConsistencyScore: 0.30,
  terminologyScore: 0.25,
  toneConsistencyScore: 0.20,
  formatConsistencyScore: 0.25,
} as const;

/**
 * Calculate the Consistency metric score.
 */
export function calculateConsistency(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const headingSignals = getAllSignals(normalized.headings).filter((s) => !s.type.endsWith("_summary"));
  const paragraphSignals = getAllSignals(normalized.paragraphs).filter((s) => !s.type.endsWith("_summary"));
  const semanticSignals = getAllSignals(normalized.semantic).filter((s) => !s.type.endsWith("_summary"));

  if (headingSignals.length === 0 && paragraphSignals.length === 0) {
    return createInsufficientResult(
      "consistency",
      "No headings or paragraphs available for consistency analysis",
      { headingCount: headingSignals.length, paragraphCount: paragraphSignals.length },
    );
  }

  // Component 1: Heading consistency — check heading style consistency
  const headingValues = headingSignals.map((s) => s.value);
  const titleCaseHeadings = headingValues.filter((v) => /^[A-Z][a-z]/.test(v)).length;
  const sentenceCaseHeadings = headingValues.filter((v) => /^[a-z]/.test(v)).length;
  const upperHeadings = headingValues.filter((v) => /^[A-Z\s]+$/.test(v) && v.length > 3).length;
  const totalHeadings = headingValues.length;
  const maxStyleCount = Math.max(titleCaseHeadings, sentenceCaseHeadings, upperHeadings);
  const headingConsistencyScore = totalHeadings > 0
    ? clampScore((maxStyleCount / totalHeadings) * 100)
    : 50;

  // Component 2: Terminology consistency — check for repeated key terms across sections
  const allText = [...headingValues, ...paragraphSignals.map((s) => s.value)].join(" ").toLowerCase();
  const words = allText.split(/\s+/).filter((w) => w.length > 4);
  const wordFreq: Record<string, number> = {};
  for (const word of words) {
    wordFreq[word] = (wordFreq[word] ?? 0) + 1;
  }
  const repeatedTerms = Object.values(wordFreq).filter((c) => c >= 2).length;
  const totalUniqueTerms = Object.keys(wordFreq).length;
  const terminologyScore = totalUniqueTerms > 0
    ? clampScore(50 + Math.min(50, (repeatedTerms / totalUniqueTerms) * 100))
    : 40;

  // Component 3: Tone consistency — check heading length consistency
  const headingLengths = headingValues.map((v) => v.split(/\s+/).length);
  const avgHeadingLen = headingLengths.length > 0
    ? headingLengths.reduce((a, b) => a + b, 0) / headingLengths.length
    : 0;
  const headingLengthVariance = headingLengths.length > 0
    ? Math.sqrt(headingLengths.reduce((sum, len) => sum + Math.pow(len - avgHeadingLen, 2), 0) / headingLengths.length)
    : 0;
  const toneConsistencyScore = headingLengths.length > 0
    ? clampScore(Math.max(40, 95 - headingLengthVariance * 10))
    : 50;

  // Component 4: Format consistency — check paragraph length consistency
  const paragraphLengths = paragraphSignals.map((s) => s.value.split(/\s+/).length);
  const avgParaLen = paragraphLengths.length > 0
    ? paragraphLengths.reduce((a, b) => a + b, 0) / paragraphLengths.length
    : 0;
  const paraLengthVariance = paragraphLengths.length > 0
    ? Math.sqrt(paragraphLengths.reduce((sum, len) => sum + Math.pow(len - avgParaLen, 2), 0) / paragraphLengths.length)
    : 0;
  const formatConsistencyScore = paragraphLengths.length > 0
    ? clampScore(Math.max(40, 95 - paraLengthVariance * 0.5))
    : 50;

  const components = {
    headingConsistencyScore,
    terminologyScore,
    toneConsistencyScore,
    formatConsistencyScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["malformed_dom", "encoding_failure", "truncated_html"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.80;
  if (totalHeadings < 3) confidence -= 0.1;
  if (paragraphSignals.length < 3) confidence -= 0.1;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${totalHeadings} headings, ${paragraphSignals.length} paragraphs`,
    `Heading style: ${titleCaseHeadings} title case, ${sentenceCaseHeadings} sentence case, ${upperHeadings} uppercase`,
    `${repeatedTerms} repeated terms out of ${totalUniqueTerms} unique terms`,
    `Heading length variance: ${headingLengthVariance.toFixed(1)}`,
    `Paragraph length variance: ${paraLengthVariance.toFixed(1)}`,
  ];

  const weaknesses: string[] = [];
  if (totalHeadings > 0 && maxStyleCount / totalHeadings < 0.7) {
    weaknesses.push("Inconsistent heading capitalization styles detected");
  }
  if (headingLengthVariance > 4) {
    weaknesses.push("High variance in heading lengths — inconsistent structure");
  }
  if (paraLengthVariance > 50) {
    weaknesses.push("High variance in paragraph lengths — inconsistent formatting");
  }
  if (repeatedTerms === 0 && totalUniqueTerms > 10) {
    weaknesses.push("No repeated key terms — terminology may be inconsistent");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (totalHeadings > 0 && maxStyleCount / totalHeadings < 0.7) {
    recommendations.push(rec("consistency", "content", "medium", "Standardize heading capitalization style (title case or sentence case) across the page.", recIndex++));
  }
  if (headingLengthVariance > 4) {
    recommendations.push(rec("consistency", "structure", "low", "Make heading lengths more consistent for better structural predictability.", recIndex++));
  }

  return createScoredResult("consistency", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      headingCount: totalHeadings,
      paragraphCount: paragraphSignals.length,
      titleCaseHeadings,
      sentenceCaseHeadings,
      upperHeadings,
      repeatedTerms,
      totalUniqueTerms,
      headingLengthVariance: Math.round(headingLengthVariance * 100) / 100,
      paraLengthVariance: Math.round(paraLengthVariance * 100) / 100,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
