/**
 * Semantic Structure Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: semanticStructure, hierarchy
 * Formula: weightedSum(structureDepthScore, sectioningScore, nestingScore, orphanScore)
 * Contamination impact: hydration_shell, malformed_dom reduce score.
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
import { getHierarchyStats, detectHierarchyIssues } from "@/modules/normalization";

/** Weights for semantic structure components. */
const COMPONENT_WEIGHTS = {
  structureDepthScore: 0.25,
  sectioningScore: 0.30,
  nestingScore: 0.20,
  orphanScore: 0.25,
} as const;

/**
 * Calculate the Semantic Structure metric score.
 */
export function calculateSemanticStructure(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const structureSignals = getAllSignals(normalized.semanticStructure).filter((s) => !s.type.endsWith("_summary"));
  const hierarchy = normalized.hierarchy;

  if (structureSignals.length === 0 && !hierarchy) {
    if (ctx.absenceCategories.has("semantic_sections") || ctx.absenceCategories.has("main_landmark")) {
      return createInsufficientResult(
        "semanticStructure",
        "No semantic structure detected — sectioning elements and hierarchy are absent",
        { structureSignalCount: 0, hasHierarchy: false },
      );
    }
    return createInsufficientResult(
      "semanticStructure",
      "No semantic structure evidence available",
      { structureSignalCount: 0, hasHierarchy: !!hierarchy },
    );
  }

  const hierarchyStats = getHierarchyStats(hierarchy);
  const hierarchyIssues = detectHierarchyIssues(hierarchy);

  // Component 1: Structure depth
  let structureDepthScore: number;
  if (hierarchyStats.maxDepth >= 5) {
    structureDepthScore = 90;
  } else if (hierarchyStats.maxDepth >= 3) {
    structureDepthScore = 80;
  } else if (hierarchyStats.maxDepth >= 2) {
    structureDepthScore = 65;
  } else if (hierarchyStats.maxDepth >= 1) {
    structureDepthScore = 45;
  } else {
    structureDepthScore = 25;
  }
  structureDepthScore = clampScore(structureDepthScore);

  // Component 2: Sectioning — count section/article/aside elements
  const sectioningTypes = new Set<string>();
  for (const sig of structureSignals) {
    const tag = (sig.metadata?.tag as string) ?? sig.type;
    if (["section", "article", "aside", "main", "nav", "header", "footer"].includes(tag)) {
      sectioningTypes.add(tag);
    }
  }
  let sectioningScore: number;
  if (sectioningTypes.size >= 5) {
    sectioningScore = 95;
  } else if (sectioningTypes.size >= 3) {
    sectioningScore = 80;
  } else if (sectioningTypes.size >= 2) {
    sectioningScore = 65;
  } else if (sectioningTypes.size >= 1) {
    sectioningScore = 45;
  } else {
    sectioningScore = 25;
  }
  sectioningScore = clampScore(sectioningScore);

  // Component 3: Nesting — total nodes in hierarchy
  let nestingScore: number;
  if (hierarchyStats.totalNodes >= 20) {
    nestingScore = 90;
  } else if (hierarchyStats.totalNodes >= 10) {
    nestingScore = 78;
  } else if (hierarchyStats.totalNodes >= 5) {
    nestingScore = 65;
  } else if (hierarchyStats.totalNodes >= 2) {
    nestingScore = 50;
  } else {
    nestingScore = 30;
  }
  nestingScore = clampScore(nestingScore);

  // Component 4: Orphan score — penalize orphan headings
  let orphanScore: number;
  if (hierarchyStats.headingCount > 0) {
    const orphanRatio = hierarchyStats.orphanCount / hierarchyStats.headingCount;
    orphanScore = clampScore(100 - orphanRatio * 60);
  } else {
    orphanScore = 40;
  }
  orphanScore = clampScore(orphanScore);

  const components = {
    structureDepthScore,
    sectioningScore,
    nestingScore,
    orphanScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["hydration_shell", "malformed_dom", "truncated_html"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.82;
  if (hierarchyIssues.length > 2) confidence -= 0.15;
  if (hierarchyStats.orphanCount > 0) confidence -= 0.05;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${structureSignals.length} semantic structure signals`,
    `Hierarchy: ${hierarchyStats.totalNodes} nodes, max depth ${hierarchyStats.maxDepth}`,
    `${hierarchyStats.headingCount} heading nodes, ${hierarchyStats.orphanCount} orphans`,
    `Sectioning types: ${[...sectioningTypes].join(", ") || "none"}`,
    `Hierarchy issues: ${hierarchyIssues.length > 0 ? hierarchyIssues.join("; ") : "none"}`,
  ];

  const weaknesses: string[] = [];
  if (hierarchyStats.orphanCount > 0) {
    weaknesses.push(`${hierarchyStats.orphanCount} orphan headings without parent`);
  }
  if (hierarchyIssues.includes("no_headings_in_hierarchy")) {
    weaknesses.push("No headings found in the document hierarchy");
  }
  if (hierarchyIssues.includes("invalid_hierarchy_structure")) {
    weaknesses.push("Heading hierarchy structure is invalid");
  }
  if (sectioningTypes.size < 2) {
    weaknesses.push(`Only ${sectioningTypes.size} sectioning element types used`);
  }
  if (hierarchyStats.maxDepth < 2) {
    weaknesses.push("Shallow hierarchy — content is not well nested");
  }
  if (ctx.absenceCategories.has("semantic_sections")) {
    weaknesses.push("Absence: no <section> semantic elements detected");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (sectioningTypes.size < 3) {
    recommendations.push(REC_TEMPLATES.semantic.addSemanticStructure("semanticStructure", recIndex++));
  }
  if (hierarchyStats.orphanCount > 0) {
    recommendations.push(rec("semanticStructure", "structure", "high", "Fix orphan headings — ensure all headings have a parent heading at a lower level.", recIndex++));
  }
  if (hierarchyStats.maxDepth < 2) {
    recommendations.push(rec("semanticStructure", "structure", "medium", "Create deeper content nesting with sectioning elements to build a richer hierarchy.", recIndex++));
  }

  return createScoredResult("semanticStructure", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      structureSignalCount: structureSignals.length,
      maxDepth: hierarchyStats.maxDepth,
      totalNodes: hierarchyStats.totalNodes,
      headingCount: hierarchyStats.headingCount,
      orphanCount: hierarchyStats.orphanCount,
      sectioningTypes: [...sectioningTypes],
      hierarchyIssues,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
