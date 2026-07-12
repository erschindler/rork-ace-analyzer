/**
 * Structure Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: headings, hierarchy
 * Formula: weightedSum(headingPresenceScore, headingDepthScore, hierarchyValidityScore, headingOrderScore)
 * Contamination impact: hydration_shell reduces score and confidence.
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
import { REC_TEMPLATES, rec } from "../recommendations";
import { getHierarchyStats } from "@/modules/normalization";

/** Weights for structure components. */
const COMPONENT_WEIGHTS = {
  headingPresenceScore: 0.30,
  headingDepthScore: 0.25,
  hierarchyValidityScore: 0.25,
  headingOrderScore: 0.20,
} as const;

/**
 * Calculate the Structure metric score.
 * @param ctx Metric context with normalized evidence.
 * @returns MetricResult for structure.
 */
export function calculateStructure(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const headingSignals = getAllSignals(normalized.headings).filter(
    (s) => !s.type.endsWith("_summary"),
  );
  const headingCount = headingSignals.length;

  // Validate required evidence
  if (headingCount === 0 && !normalized.hierarchy) {
    if (ctx.absenceCategories.has("primary_heading") || ctx.absenceCategories.has("h1")) {
      return createInsufficientResult(
        "structure",
        "No headings found — heading structure is absent",
        { headingCount: 0, hasHierarchy: false },
      );
    }
    return createInsufficientResult(
      "structure",
      "No heading evidence available for structure analysis",
      { headingCount: 0, hasHierarchy: !!normalized.hierarchy },
    );
  }

  // Component 1: Heading presence — more headings = better structure
  let headingPresenceScore: number;
  if (headingCount >= 10) {
    headingPresenceScore = 95;
  } else if (headingCount >= 5) {
    headingPresenceScore = 85;
  } else if (headingCount >= 3) {
    headingPresenceScore = 70;
  } else if (headingCount >= 1) {
    headingPresenceScore = 50;
  } else {
    headingPresenceScore = 20;
  }
  headingPresenceScore = clampScore(headingPresenceScore);

  // Component 2: Heading depth — measure diversity of heading levels
  const headingLevels = new Set<number>();
  let hasH1 = false;
  for (const sig of headingSignals) {
    const level = (sig.metadata?.level as number) ?? 0;
    if (level > 0) headingLevels.add(level);
    if (level === 1 || sig.type === "h1") hasH1 = true;
  }
  const levelDiversity = headingLevels.size;
  let headingDepthScore: number;
  if (levelDiversity >= 4) {
    headingDepthScore = 95;
  } else if (levelDiversity >= 3) {
    headingDepthScore = 85;
  } else if (levelDiversity >= 2) {
    headingDepthScore = 70;
  } else if (levelDiversity >= 1) {
    headingDepthScore = 50;
  } else {
    headingDepthScore = 20;
  }
  if (!hasH1) headingDepthScore -= 15;
  headingDepthScore = clampScore(headingDepthScore);

  // Component 3: Hierarchy validity — use hierarchy stats
  const hierarchyStats = getHierarchyStats(normalized.hierarchy);
  let hierarchyValidityScore: number;
  if (hierarchyStats.hasValidHierarchy && hierarchyStats.headingCount > 0) {
    const orphanRatio = hierarchyStats.orphanCount / hierarchyStats.headingCount;
    hierarchyValidityScore = clampScore(100 - orphanRatio * 50);
  } else if (hierarchyStats.headingCount > 0) {
    hierarchyValidityScore = 40;
  } else {
    hierarchyValidityScore = 30;
  }
  hierarchyValidityScore = clampScore(hierarchyValidityScore);

  // Component 4: Heading order — check for skipped levels
  let skippedLevels = 0;
  let prevLevel = 0;
  for (const sig of headingSignals) {
    const level = (sig.metadata?.level as number) ?? 0;
    if (prevLevel > 0 && level > prevLevel + 1) {
      skippedLevels++;
    }
    if (level > 0) prevLevel = level;
  }
  let headingOrderScore: number;
  if (skippedLevels === 0) {
    headingOrderScore = 95;
  } else if (skippedLevels <= 2) {
    headingOrderScore = 75;
  } else {
    headingOrderScore = Math.max(30, 95 - skippedLevels * 10);
  }
  headingOrderScore = clampScore(headingOrderScore);

  // Weighted sum
  const components = {
    headingPresenceScore,
    headingDepthScore,
    hierarchyValidityScore,
    headingOrderScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  // Apply contamination penalty
  const contaminationResult = applyContaminationPenalty(score, ctx, ["hydration_shell", "malformed_dom", "truncated_html"]);
  score = clampScore(contaminationResult.score);

  // Confidence model
  let confidence = 0.85;
  if (!hasH1) confidence -= 0.1;
  if (skippedLevels > 0) confidence -= 0.05;
  if (hierarchyStats.orphanCount > 0) confidence -= 0.05;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  // Evidence
  const evidence: string[] = [
    `${headingCount} headings detected`,
    `${levelDiversity} heading levels (h1-h6)`,
    `H1 present: ${hasH1 ? "yes" : "no"}`,
    `Hierarchy: ${hierarchyStats.headingCount} heading nodes, ${hierarchyStats.orphanCount} orphans`,
    `${skippedLevels} skipped heading levels`,
  ];

  // Weaknesses
  const weaknesses: string[] = [];
  if (!hasH1) weaknesses.push("No h1 (primary heading) found");
  if (skippedLevels > 0) weaknesses.push(`${skippedLevels} heading level skips detected`);
  if (hierarchyStats.orphanCount > 0) weaknesses.push(`${hierarchyStats.orphanCount} orphan headings without parent`);
  if (headingCount < 3) weaknesses.push("Very few headings — structure is minimal");
  if (!hierarchyStats.hasValidHierarchy) weaknesses.push("Heading hierarchy is not valid");
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  // Absence evidence mapping
  if (ctx.absenceCategories.has("primary_heading")) {
    weaknesses.push("Absence: no h1 heading found");
  }

  // Recommendations
  const recommendations = [];
  let recIndex = 0;
  if (!hasH1 || headingCount < 3) {
    recommendations.push(REC_TEMPLATES.structure.addHeadings("structure", recIndex++));
  }
  if (skippedLevels > 0) {
    recommendations.push(REC_TEMPLATES.structure.fixHierarchy("structure", recIndex++));
  }
  if (!hierarchyStats.hasValidHierarchy && headingCount > 0) {
    recommendations.push(rec("structure", "structure", "medium", "Restructure heading hierarchy to follow a logical parent-child pattern.", recIndex++));
  }

  return createScoredResult(
    "structure",
    score,
    confidence,
    evidence,
    weaknesses,
    recommendations,
    {
      inputs: {
        headingCount,
        levelDiversity,
        hasH1,
        orphanCount: hierarchyStats.orphanCount,
        skippedLevels,
        hierarchyMaxDepth: hierarchyStats.maxDepth,
      },
      components,
      formula: buildFormula(COMPONENT_WEIGHTS, score),
      result: score,
    },
  );
}
