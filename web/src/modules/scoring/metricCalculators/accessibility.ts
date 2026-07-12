/**
 * Accessibility Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: accessibility, semantic
 * Formula: weightedSum(altCoverageScore, landmarkScore, ariaLabelScore, issueScore, skipLinkScore)
 * Contamination impact: shadow_dom, malformed_dom reduce score.
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
  countContentSignals,
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES } from "../recommendations";

/** Weights for accessibility components. */
const COMPONENT_WEIGHTS = {
  altCoverageScore: 0.35,
  landmarkScore: 0.20,
  ariaLabelScore: 0.15,
  issueScore: 0.20,
  skipLinkScore: 0.10,
} as const;

/**
 * Calculate the Accessibility metric score.
 */
export function calculateAccessibility(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const accessibilitySignals = getAllSignals(normalized.accessibility).filter(
    (s) => !s.type.endsWith("_summary"),
  );
  const semanticSignals = getAllSignals(normalized.semantic).filter(
    (s) => !s.type.endsWith("_summary"),
  );

  if (accessibilitySignals.length === 0 && semanticSignals.length === 0) {
    if (ctx.absenceCategories.has("image_alt_text")) {
      return createInsufficientResult(
        "accessibility",
        "No accessibility evidence — alt text, ARIA, and landmarks are absent",
        { signalCount: 0 },
      );
    }
    return createInsufficientResult(
      "accessibility",
      "No accessibility evidence available for analysis",
      { signalCount: accessibilitySignals.length },
    );
  }

  const summary = findSummarySignal(normalized.accessibility);
  const totalImages = getMetaNum(summary, "totalImages") ?? 0;
  const imagesWithAlt = getMetaNum(summary, "imagesWithAlt") ?? 0;
  const imagesWithoutAlt = getMetaNum(summary, "imagesWithoutAlt") ?? 0;
  const altCoverage = getMetaNum(summary, "altCoverage") ?? (totalImages > 0 ? imagesWithAlt / totalImages : 1);
  const landmarkCount = getMetaNum(summary, "landmarkCount") ?? 0;
  const ariaLabelCount = getMetaNum(summary, "ariaLabelCount") ?? 0;
  const issuesCount = getMetaNum(summary, "issuesCount") ?? 0;

  // Component 1: Alt coverage score
  let altCoverageScore: number;
  if (totalImages === 0) {
    // No images — neutral score (no alt needed, but no positive signal either)
    altCoverageScore = 70;
  } else {
    altCoverageScore = clampScore(altCoverage * 100);
  }
  altCoverageScore = clampScore(altCoverageScore);

  // Component 2: Landmark score
  let landmarkScore: number;
  if (landmarkCount >= 5) {
    landmarkScore = 95;
  } else if (landmarkCount >= 3) {
    landmarkScore = 80;
  } else if (landmarkCount >= 2) {
    landmarkScore = 65;
  } else if (landmarkCount >= 1) {
    landmarkScore = 45;
  } else {
    landmarkScore = 25;
  }
  landmarkScore = clampScore(landmarkScore);

  // Component 3: ARIA label score
  let ariaLabelScore: number;
  if (ariaLabelCount >= 5) {
    ariaLabelScore = 90;
  } else if (ariaLabelCount >= 2) {
    ariaLabelScore = 75;
  } else if (ariaLabelCount >= 1) {
    ariaLabelScore = 60;
  } else {
    ariaLabelScore = 40;
  }
  ariaLabelScore = clampScore(ariaLabelScore);

  // Component 4: Issue score — penalize accessibility issues
  let issueScore: number;
  if (issuesCount === 0) {
    issueScore = 95;
  } else if (issuesCount <= 2) {
    issueScore = 75;
  } else if (issuesCount <= 5) {
    issueScore = 55;
  } else {
    issueScore = Math.max(20, 75 - (issuesCount - 2) * 10);
  }
  issueScore = clampScore(issueScore);

  // Component 5: Skip link score
  const hasSkipLink = accessibilitySignals.some((s) => s.type === "skip_link");
  const skipLinkScore = hasSkipLink ? 90 : 50;
  const skipLinkScoreClamped = clampScore(skipLinkScore);

  const components = {
    altCoverageScore,
    landmarkScore,
    ariaLabelScore,
    issueScore,
    skipLinkScore: skipLinkScoreClamped,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["shadow_dom", "malformed_dom"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.82;
  if (imagesWithoutAlt > 0) confidence -= 0.1;
  if (issuesCount > 3) confidence -= 0.1;
  if (landmarkCount === 0) confidence -= 0.1;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `Images: ${totalImages} total, ${imagesWithAlt} with alt, ${imagesWithoutAlt} without alt`,
    `Alt coverage: ${(altCoverage * 100).toFixed(0)}%`,
    `Landmarks: ${landmarkCount}`,
    `ARIA labels: ${ariaLabelCount}`,
    `Accessibility issues: ${issuesCount}`,
    `Skip link: ${hasSkipLink ? "present" : "absent"}`,
  ];

  const weaknesses: string[] = [];
  if (imagesWithoutAlt > 0) {
    weaknesses.push(`${imagesWithoutAlt} images missing alt text`);
  }
  if (landmarkCount < 2) {
    weaknesses.push(`Only ${landmarkCount} landmark elements — page lacks semantic navigation structure`);
  }
  if (issuesCount > 0) {
    weaknesses.push(`${issuesCount} accessibility issues detected (missing labels, missing alt, etc.)`);
  }
  if (!hasSkipLink) {
    weaknesses.push("No skip-to-content link found");
  }
  if (ctx.absenceCategories.has("image_alt_text")) {
    weaknesses.push("Absence: images without alt text detected");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (imagesWithoutAlt > 0) {
    recommendations.push(REC_TEMPLATES.accessibility.addAltText("accessibility", recIndex++));
  }
  if (landmarkCount < 2) {
    recommendations.push(REC_TEMPLATES.structure.addLandmarks("accessibility", recIndex++));
  }
  if (ariaLabelCount === 0 && issuesCount > 0) {
    recommendations.push(REC_TEMPLATES.accessibility.addAriaLabels("accessibility", recIndex++));
  }
  if (!hasSkipLink) {
    recommendations.push(REC_TEMPLATES.accessibility.addSkipLink("accessibility", recIndex++));
  }
  // Check for form label issues
  const hasFormLabelIssues = accessibilitySignals.some((s) => s.type === "inputs_without_label");
  if (hasFormLabelIssues) {
    recommendations.push(REC_TEMPLATES.accessibility.addFormLabels("accessibility", recIndex++));
  }

  return createScoredResult("accessibility", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      totalImages,
      imagesWithAlt,
      imagesWithoutAlt,
      altCoverage,
      landmarkCount,
      ariaLabelCount,
      issuesCount,
      hasSkipLink,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
