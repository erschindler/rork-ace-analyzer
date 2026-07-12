/**
 * Machine Comprehension Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: semantic, semanticStructure, extractability, structuredData, entities
 * Formula: weightedSum(semanticRichnessScore, structureQualityScore, extractabilityQualityScore,
 *   structuredDataScore, entityScore)
 *
 * Machine Comprehension depends on:
 *   - Semantic
 *   - Semantic Structure
 *   - Extractability
 *   - Structured Data
 *   - Entity Recognition
 *
 * Contamination impact: all critical contamination types heavily reduce score.
 */

import type { MetricResult } from "../scoringTypes";
import {
  createScoredResult,
  createInsufficientResult,
  clampScore,
  applyContaminationPenalty,
  applyContaminationConfidence,
  buildFormula,
  countContentSignals,
  getAllSignals,
  findSummarySignal,
  getMetaNum,
  getMetaBool,
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES, rec } from "../recommendations";
import { getHierarchyStats } from "@/modules/normalization";

/** Weights for machine comprehension components. */
const COMPONENT_WEIGHTS = {
  semanticRichnessScore: 0.25,
  structureQualityScore: 0.20,
  extractabilityQualityScore: 0.20,
  structuredDataScore: 0.20,
  entityScore: 0.15,
} as const;

/**
 * Calculate the Machine Comprehension metric score.
 * This is the composite metric that depends on other metric evidence areas.
 */
export function calculateMachineComprehension(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;

  // Required evidence: semantic, semanticStructure, extractability, structuredData, entities
  const semanticCount = countContentSignals(normalized.semantic);
  const structureCount = countContentSignals(normalized.semanticStructure);
  const extractabilityCount = countContentSignals(normalized.extractability);
  const structuredDataCount = countContentSignals(normalized.structuredData);
  const entityCount = countContentSignals(normalized.entities);

  const totalEvidenceSignals = semanticCount + structureCount + extractabilityCount + structuredDataCount + entityCount;

  if (totalEvidenceSignals === 0) {
    const missing: string[] = [];
    if (semanticCount === 0) missing.push("semantic");
    if (structureCount === 0) missing.push("semanticStructure");
    if (extractabilityCount === 0) missing.push("extractability");
    if (structuredDataCount === 0) missing.push("structuredData");
    if (entityCount === 0) missing.push("entities");
    return createInsufficientResult(
      "machineComprehension",
      `Insufficient evidence for machine comprehension — missing: ${missing.join(", ")}`,
      { semanticCount, structureCount, extractabilityCount, structuredDataCount, entityCount, missing },
    );
  }

  // Component 1: Semantic richness — semantic HTML + semantic structure
  const semanticSignals = getAllSignals(normalized.semantic).filter((s) => !s.type.endsWith("_summary"));
  const semanticTagTypes = new Set(semanticSignals.map((s) => (s.metadata?.normalizedTag as string) ?? s.type));
  let semanticRichnessScore: number;
  if (semanticTagTypes.size >= 5 && structureCount >= 5) {
    semanticRichnessScore = 95;
  } else if (semanticTagTypes.size >= 3 && structureCount >= 3) {
    semanticRichnessScore = 80;
  } else if (semanticTagTypes.size >= 2) {
    semanticRichnessScore = 60;
  } else if (semanticTagTypes.size >= 1) {
    semanticRichnessScore = 40;
  } else {
    semanticRichnessScore = 20;
  }
  semanticRichnessScore = clampScore(semanticRichnessScore);

  // Component 2: Structure quality — hierarchy validity
  const hierarchyStats = getHierarchyStats(normalized.hierarchy);
  let structureQualityScore: number;
  if (hierarchyStats.hasValidHierarchy && hierarchyStats.headingCount >= 5) {
    structureQualityScore = 90;
  } else if (hierarchyStats.hasValidHierarchy && hierarchyStats.headingCount >= 2) {
    structureQualityScore = 72;
  } else if (hierarchyStats.headingCount > 0) {
    structureQualityScore = 50;
  } else {
    structureQualityScore = 25;
  }
  structureQualityScore = clampScore(structureQualityScore);

  // Component 3: Extractability quality — content density and noise
  const extractAssessment = getAllSignals(normalized.extractability).find(
    (s) => s.type === "extractability_assessment",
  );
  const isExtractable = getMetaBool(extractAssessment, "overallExtractability") ?? false;
  const contentDensity = getMetaNum(
    getAllSignals(normalized.extractability).find((s) => s.type === "content_density"),
    "contentDensity",
  ) ?? 0;
  let extractabilityQualityScore: number;
  if (isExtractable && contentDensity > 0.5) {
    extractabilityQualityScore = 90;
  } else if (isExtractable) {
    extractabilityQualityScore = 70;
  } else if (contentDensity > 0.3) {
    extractabilityQualityScore = 50;
  } else {
    extractabilityQualityScore = 25;
  }
  extractabilityQualityScore = clampScore(extractabilityQualityScore);

  // Component 4: Structured data score
  const sdSummary = findSummarySignal(normalized.structuredData);
  const jsonLdCount = getMetaNum(sdSummary, "jsonLdCount") ?? 0;
  const schemaTypes = (sdSummary?.metadata?.schemaTypes as string[]) ?? [];
  const hasValidSchema = getMetaBool(sdSummary, "hasValidSchema") ?? false;
  let structuredDataScore: number;
  if (hasValidSchema && jsonLdCount >= 2 && schemaTypes.length >= 3) {
    structuredDataScore = 95;
  } else if (hasValidSchema && jsonLdCount >= 1) {
    structuredDataScore = 75;
  } else if (structuredDataCount > 0) {
    structuredDataScore = 50;
  } else {
    structuredDataScore = 20;
  }
  structuredDataScore = clampScore(structuredDataScore);

  // Component 5: Entity score
  const entitySummary = findSummarySignal(normalized.entities);
  const totalEntities = getMetaNum(entitySummary, "totalEntities") ?? 0;
  const entityDiversity = getMetaNum(entitySummary, "entityDiversity") ?? 0;
  let entityScore: number;
  if (totalEntities >= 10 && entityDiversity >= 4) {
    entityScore = 90;
  } else if (totalEntities >= 5 && entityDiversity >= 2) {
    entityScore = 72;
  } else if (totalEntities >= 2) {
    entityScore = 50;
  } else if (totalEntities >= 1) {
    entityScore = 35;
  } else {
    entityScore = 15;
  }
  entityScore = clampScore(entityScore);

  const components = {
    semanticRichnessScore,
    structureQualityScore,
    extractabilityQualityScore,
    structuredDataScore,
    entityScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  // Machine comprehension is heavily impacted by all contamination types
  const contaminationResult = applyContaminationPenalty(score, ctx, [
    "hydration_shell", "script_only_dom", "shadow_dom", "boilerplate_only",
    "malformed_dom", "encoding_failure", "missing_main_content", "truncated_html",
  ]);
  score = clampScore(contaminationResult.score);

  // Confidence model — depends on quality of all dependency areas
  let confidence = 0.80;
  if (!isExtractable) confidence -= 0.15;
  if (jsonLdCount === 0) confidence -= 0.1;
  if (totalEntities < 3) confidence -= 0.1;
  if (!hierarchyStats.hasValidHierarchy) confidence -= 0.1;
  if (semanticTagTypes.size < 2) confidence -= 0.05;
  confidence = Math.max(0.25, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `Semantic: ${semanticTagTypes.size} tag types, ${structureCount} structure signals`,
    `Hierarchy: ${hierarchyStats.headingCount} headings, valid=${hierarchyStats.hasValidHierarchy}`,
    `Extractability: ${isExtractable ? "extractable" : "non-extractable"}, density=${(contentDensity * 100).toFixed(0)}%`,
    `Structured data: ${jsonLdCount} JSON-LD, ${schemaTypes.length} schema types`,
    `Entities: ${totalEntities} entities across ${entityDiversity} types`,
  ];

  const weaknesses: string[] = [];
  if (!isExtractable) weaknesses.push("Content is not extractable — machine comprehension is severely degraded");
  if (jsonLdCount === 0) weaknesses.push("No JSON-LD structured data — machines lack explicit type information");
  if (totalEntities < 3) weaknesses.push(`Only ${totalEntities} entities — insufficient for machine comprehension`);
  if (!hierarchyStats.hasValidHierarchy) weaknesses.push("Invalid heading hierarchy — content structure is unclear to machines");
  if (semanticTagTypes.size < 3) weaknesses.push(`Only ${semanticTagTypes.size} semantic tag types — low semantic richness`);
  if (ctx.absenceCategories.has("main_landmark")) {
    weaknesses.push("Absence: no <main> landmark — machine cannot identify primary content");
  }
  if (ctx.absenceCategories.has("structured_data")) {
    weaknesses.push("Absence: no structured data — machine lacks schema.org context");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (jsonLdCount === 0) {
    recommendations.push(REC_TEMPLATES.metadata.addJsonLd("machineComprehension", recIndex++));
  }
  if (!isExtractable) {
    recommendations.push(REC_TEMPLATES.extractability.addMainContent("machineComprehension", recIndex++));
  }
  if (semanticTagTypes.size < 3) {
    recommendations.push(REC_TEMPLATES.semantic.addSemanticHtml("machineComprehension", recIndex++));
  }
  if (totalEntities < 3) {
    recommendations.push(rec("machineComprehension", "content", "medium", "Include more named entities in content to improve machine comprehension of page topics.", recIndex++));
  }
  if (!hierarchyStats.hasValidHierarchy) {
    recommendations.push(REC_TEMPLATES.structure.fixHierarchy("machineComprehension", recIndex++));
  }

  return createScoredResult("machineComprehension", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      semanticTagTypes: [...semanticTagTypes],
      structureCount,
      headingCount: hierarchyStats.headingCount,
      hasValidHierarchy: hierarchyStats.hasValidHierarchy,
      isExtractable,
      contentDensity,
      jsonLdCount,
      schemaTypes,
      totalEntities,
      entityDiversity,
      totalEvidenceSignals,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
