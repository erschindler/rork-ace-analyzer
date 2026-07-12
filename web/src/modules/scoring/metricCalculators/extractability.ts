/**
 * Extractability Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: extractability, redundancy
 * Formula: weightedSum(contentDensityScore, noiseRatioScore, boilerplateScore, redundancyScore, extractableRegionScore)
 * Contamination impact: hydration_shell, shadow_dom, boilerplate_only reduce score.
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
  findSummarySignal,
  getMetaNum,
  getMetaBool,
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES } from "../recommendations";

/** Weights for extractability components. */
const COMPONENT_WEIGHTS = {
  contentDensityScore: 0.30,
  noiseRatioScore: 0.20,
  boilerplateScore: 0.15,
  redundancyScore: 0.15,
  extractableRegionScore: 0.20,
} as const;

/**
 * Calculate the Extractability metric score.
 */
export function calculateExtractability(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const extractabilitySignals = getAllSignals(normalized.extractability).filter(
    (s) => !s.type.endsWith("_summary") && !s.type.endsWith("_assessment"),
  );
  const redundancySignals = getAllSignals(normalized.redundancy).filter(
    (s) => !s.type.endsWith("_summary"),
  );

  if (extractabilitySignals.length === 0) {
    if (ctx.absenceCategories.has("main_landmark") || ctx.criticalAbsence.includes("main_landmark")) {
      return createInsufficientResult(
        "extractability",
        "Main content not detected — extractability cannot be assessed",
        { signalCount: 0 },
      );
    }
    return createInsufficientResult(
      "extractability",
      "No extractability evidence available",
      { signalCount: 0 },
    );
  }

  // Extract metrics from signals
  const densitySignal = extractabilitySignals.find((s) => s.type === "content_density");
  const noiseSignal = extractabilitySignals.find((s) => s.type === "noise_ratio");
  const boilerplateSignal = extractabilitySignals.find((s) => s.type === "boilerplate_detection");
  const regionSignals = extractabilitySignals.filter((s) => s.type === "extractable_region");
  const repeatedSignal = extractabilitySignals.find((s) => s.type === "repeated_blocks");

  const contentDensity = getMetaNum(densitySignal, "contentDensity") ?? 0;
  const noiseRatio = getMetaNum(noiseSignal, "noiseRatio") ?? 1;
  const boilerplateCount = getMetaNum(boilerplateSignal, "boilerplateElements") ?? 0;
  const repetitionRatio = getMetaNum(repeatedSignal, "repetitionRatio") ?? 0;

  // Component 1: Content density score
  const contentDensityScore = clampScore(contentDensity * 100);

  // Component 2: Noise ratio score — lower noise = higher score
  const noiseRatioScore = clampScore((1 - noiseRatio) * 100);

  // Component 3: Boilerplate score — fewer boilerplate elements = higher score
  let boilerplateScore: number;
  if (boilerplateCount === 0) {
    boilerplateScore = 95;
  } else if (boilerplateCount <= 2) {
    boilerplateScore = 80;
  } else if (boilerplateCount <= 5) {
    boilerplateScore = 60;
  } else {
    boilerplateScore = Math.max(25, 80 - (boilerplateCount - 2) * 10);
  }
  boilerplateScore = clampScore(boilerplateScore);

  // Component 4: Redundancy score — less repetition = higher score
  const redundancySummary = findSummarySignal(normalized.redundancy);
  const totalRedundant = getMetaNum(redundancySummary, "totalRedundant") ?? redundancySignals.length;
  const maxRepetition = getMetaNum(redundancySummary, "maxRepetition") ?? 0;
  let redundancyScore: number;
  if (totalRedundant === 0 && maxRepetition === 0) {
    redundancyScore = 95;
  } else if (totalRedundant <= 2 && maxRepetition <= 2) {
    redundancyScore = 80;
  } else if (totalRedundant <= 5) {
    redundancyScore = 60;
  } else {
    redundancyScore = Math.max(20, 80 - totalRedundant * 8);
  }
  redundancyScore = clampScore(redundancyScore);

  // Component 5: Extractable region score
  const extractableRegionCount = regionSignals.length;
  const regionsWithContent = regionSignals.filter((s) => {
    const len = getMetaNum(s, "textLength") ?? 0;
    return len > 50;
  }).length;
  let extractableRegionScore: number;
  if (regionsWithContent >= 3) {
    extractableRegionScore = 95;
  } else if (regionsWithContent >= 2) {
    extractableRegionScore = 80;
  } else if (regionsWithContent >= 1) {
    extractableRegionScore = 60;
  } else {
    extractableRegionScore = 30;
  }
  extractableRegionScore = clampScore(extractableRegionScore);

  const components = {
    contentDensityScore,
    noiseRatioScore,
    boilerplateScore,
    redundancyScore,
    extractableRegionScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  // Extractability is heavily impacted by contamination
  const contaminationResult = applyContaminationPenalty(score, ctx, [
    "hydration_shell", "shadow_dom", "boilerplate_only", "script_only_dom", "missing_main_content",
  ]);
  score = clampScore(contaminationResult.score);

  // Check overall extractability assessment
  const assessmentSignal = getAllSignals(normalized.extractability).find(
    (s) => s.type === "extractability_assessment",
  );
  const isExtractable = getMetaBool(assessmentSignal, "overallExtractability") ?? false;
  if (!isExtractable && !ctx.isContaminated) {
    score = clampScore(score * 0.7);
  }

  let confidence = 0.82;
  if (!isExtractable) confidence -= 0.2;
  if (noiseRatio > 0.5) confidence -= 0.1;
  if (contentDensity < 0.3) confidence -= 0.1;
  confidence = Math.max(0.25, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `Content density: ${(contentDensity * 100).toFixed(1)}%`,
    `Noise ratio: ${(noiseRatio * 100).toFixed(1)}%`,
    `Boilerplate regions: ${boilerplateCount}`,
    `Redundant items: ${totalRedundant}, max repetition: ${maxRepetition}`,
    `Extractable regions: ${regionsWithContent}/${extractableRegionCount} with content`,
    `Overall extractable: ${isExtractable ? "yes" : "no"}`,
  ];

  const weaknesses: string[] = [];
  if (contentDensity < 0.3) weaknesses.push(`Low content density (${(contentDensity * 100).toFixed(1)}%) — main content is sparse`);
  if (noiseRatio > 0.5) weaknesses.push(`High noise ratio (${(noiseRatio * 100).toFixed(1)}%) — too much non-content markup`);
  if (boilerplateCount > 3) weaknesses.push(`${boilerplateCount} boilerplate regions detected`);
  if (totalRedundant > 3) weaknesses.push(`${totalRedundant} redundant content blocks — content is duplicated`);
  if (!isExtractable) weaknesses.push("Content is not extractable — main content region not clearly identifiable");
  if (ctx.absenceCategories.has("main_landmark")) {
    weaknesses.push("Absence: no <main> landmark — content extraction is degraded");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (!isExtractable || contentDensity < 0.3) {
    recommendations.push(REC_TEMPLATES.extractability.addMainContent("extractability", recIndex++));
  }
  if (noiseRatio > 0.5) {
    recommendations.push(REC_TEMPLATES.extractability.reduceNoise("extractability", recIndex++));
  }
  if (totalRedundant > 3) {
    recommendations.push(REC_TEMPLATES.extractability.reduceRedundancy("extractability", recIndex++));
  }

  return createScoredResult("extractability", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      contentDensity,
      noiseRatio,
      boilerplateCount,
      totalRedundant,
      maxRepetition,
      extractableRegionCount,
      regionsWithContent,
      isExtractable,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
