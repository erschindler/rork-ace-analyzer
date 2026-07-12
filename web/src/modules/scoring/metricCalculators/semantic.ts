/**
 * Semantic Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: semantic, semanticStructure
 * Formula: weightedSum(semanticTagScore, semanticDiversityScore, landmarkScore, semanticStructureScore)
 * Contamination impact: hydration_shell, shadow_dom reduce score.
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
  getMetaNum,
  getMetaBool,
  findSummarySignal,
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES } from "../recommendations";

/** Weights for semantic components. */
const COMPONENT_WEIGHTS = {
  semanticTagScore: 0.30,
  semanticDiversityScore: 0.25,
  landmarkScore: 0.20,
  semanticStructureScore: 0.25,
} as const;

/** Valuable semantic HTML5 tags. */
const SEMANTIC_TAGS = new Set([
  "main", "article", "section", "nav", "header", "footer",
  "aside", "figure", "figcaption", "time", "mark", "details", "summary",
]);

/**
 * Calculate the Semantic metric score.
 */
export function calculateSemantic(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const semanticSignals = getAllSignals(normalized.semantic).filter((s) => !s.type.endsWith("_summary"));
  const structureSignals = getAllSignals(normalized.semanticStructure).filter((s) => !s.type.endsWith("_summary"));

  if (semanticSignals.length === 0 && structureSignals.length === 0) {
    if (ctx.absenceCategories.has("semantic_sections") || ctx.absenceCategories.has("main_landmark")) {
      return createInsufficientResult(
        "semantic",
        "No semantic HTML detected — semantic elements are absent",
        { semanticSignalCount: 0, structureSignalCount: 0 },
      );
    }
    return createInsufficientResult(
      "semantic",
      "No semantic evidence available for analysis",
      { semanticSignalCount: semanticSignals.length, structureSignalCount: structureSignals.length },
    );
  }

  // Component 1: Semantic tag score — count valuable semantic tags
  const semanticTagTypes = new Set<string>();
  for (const sig of semanticSignals) {
    const tag = (sig.metadata?.normalizedTag as string) ?? sig.type;
    if (SEMANTIC_TAGS.has(tag)) {
      semanticTagTypes.add(tag);
    }
  }
  let semanticTagScore: number;
  if (semanticTagTypes.size >= 6) {
    semanticTagScore = 95;
  } else if (semanticTagTypes.size >= 4) {
    semanticTagScore = 85;
  } else if (semanticTagTypes.size >= 2) {
    semanticTagScore = 70;
  } else if (semanticTagTypes.size >= 1) {
    semanticTagScore = 50;
  } else {
    semanticTagScore = 25;
  }
  semanticTagScore = clampScore(semanticTagScore);

  // Component 2: Semantic diversity — unique semantic elements
  const allSemanticTypes = new Set<string>();
  for (const sig of semanticSignals) {
    allSemanticTypes.add((sig.metadata?.normalizedTag as string) ?? sig.type);
  }
  for (const sig of structureSignals) {
    allSemanticTypes.add(sig.type);
  }
  const semanticDiversityScore = clampScore(Math.min(100, 40 + allSemanticTypes.size * 10));

  // Component 3: Landmark score — check for key landmarks
  const hasMain = semanticSignals.some((s) => {
    const tag = (s.metadata?.normalizedTag as string) ?? s.type;
    return tag === "main" || tag === "banner";
  });
  const hasNav = semanticSignals.some((s) => {
    const tag = (s.metadata?.normalizedTag as string) ?? s.type;
    return tag === "nav" || tag === "navigation";
  });
  const hasHeader = semanticSignals.some((s) => {
    const tag = (s.metadata?.normalizedTag as string) ?? s.type;
    return tag === "header";
  });
  const hasFooter = semanticSignals.some((s) => {
    const tag = (s.metadata?.normalizedTag as string) ?? s.type;
    return tag === "footer";
  });
  const hasArticle = semanticSignals.some((s) => {
    const tag = (s.metadata?.normalizedTag as string) ?? s.type;
    return tag === "article";
  });
  const landmarkCount = [hasMain, hasNav, hasHeader, hasFooter, hasArticle].filter(Boolean).length;
  const landmarkScore = clampScore(landmarkCount * 20);

  // Component 4: Semantic structure score
  const structureCount = structureSignals.length;
  let semanticStructureScore: number;
  if (structureCount >= 8) {
    semanticStructureScore = 90;
  } else if (structureCount >= 4) {
    semanticStructureScore = 75;
  } else if (structureCount >= 2) {
    semanticStructureScore = 60;
  } else if (structureCount >= 1) {
    semanticStructureScore = 45;
  } else {
    semanticStructureScore = 30;
  }
  semanticStructureScore = clampScore(semanticStructureScore);

  const components = {
    semanticTagScore,
    semanticDiversityScore,
    landmarkScore,
    semanticStructureScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["hydration_shell", "shadow_dom"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.83;
  if (!hasMain) confidence -= 0.1;
  if (semanticTagTypes.size < 2) confidence -= 0.1;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${semanticSignals.length} semantic HTML signals`,
    `${semanticTagTypes.size} unique semantic tag types: ${[...semanticTagTypes].join(", ")}`,
    `Landmarks: main=${hasMain}, nav=${hasNav}, header=${hasHeader}, footer=${hasFooter}, article=${hasArticle}`,
    `${structureCount} semantic structure signals`,
  ];

  const weaknesses: string[] = [];
  if (!hasMain) weaknesses.push("No <main> element found — primary content is not semantically marked");
  if (!hasNav) weaknesses.push("No <nav> element found — navigation is not semantically marked");
  if (!hasArticle) weaknesses.push("No <article> element found — content is not semantically grouped");
  if (semanticTagTypes.size < 3) weaknesses.push(`Only ${semanticTagTypes.size} semantic tag types used — low semantic richness`);
  if (structureCount < 3) weaknesses.push("Limited semantic structure — few sectioning elements");
  if (ctx.absenceCategories.has("semantic_sections")) {
    weaknesses.push("Absence: no semantic <section> elements detected");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (semanticTagTypes.size < 3) {
    recommendations.push(REC_TEMPLATES.semantic.addSemanticHtml("semantic", recIndex++));
  }
  if (!hasMain) {
    recommendations.push(REC_TEMPLATES.structure.addLandmarks("semantic", recIndex++));
  }
  if (structureCount < 3) {
    recommendations.push(REC_TEMPLATES.semantic.addSemanticStructure("semantic", recIndex++));
  }

  return createScoredResult("semantic", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      semanticSignalCount: semanticSignals.length,
      structureSignalCount: structureSignals.length,
      semanticTagTypes: [...semanticTagTypes],
      landmarkCount,
      hasMain,
      hasNav,
      hasArticle,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
