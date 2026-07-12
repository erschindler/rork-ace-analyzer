/**
 * Entity Recognition Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: entities
 * Formula: weightedSum(entityCountScore, entityDiversityScore, entityConfidenceScore, entityCoverageScore)
 * Contamination impact: script_only_dom, encoding_failure reduce score.
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
import { rec } from "../recommendations";

/** Weights for entity recognition components. */
const COMPONENT_WEIGHTS = {
  entityCountScore: 0.30,
  entityDiversityScore: 0.30,
  entityConfidenceScore: 0.20,
  entityCoverageScore: 0.20,
} as const;

/** Valuable entity types for machine comprehension. */
const VALUABLE_ENTITY_TYPES = new Set([
  "person", "organization", "location", "date",
  "product", "money", "quantity",
  "phone", "email", "address", "social", "url",
]);

/**
 * Calculate the Entity Recognition metric score.
 */
export function calculateEntityRecognition(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const entitySignals = getAllSignals(normalized.entities).filter(
    (s) => !s.type.endsWith("_summary"),
  );

  if (entitySignals.length === 0) {
    if (ctx.absenceCategories.has("no_entities") || ctx.absenceCategories.has("entities")) {
      return createInsufficientResult(
        "entityRecognition",
        "No entities detected — entity recognition cannot be performed",
        { entityCount: 0 },
      );
    }
    return createInsufficientResult(
      "entityRecognition",
      "No entity evidence available for analysis",
      { entityCount: 0 },
    );
  }

  const summary = findSummarySignal(normalized.entities);
  const totalEntities = getMetaNum(summary, "totalEntities") ?? entitySignals.length;
  const entityDiversity = getMetaNum(summary, "entityDiversity") ?? 0;
  const entityCounts = (summary?.metadata?.entityCounts as Record<string, number>) ?? {};

  // Component 1: Entity count score
  let entityCountScore: number;
  if (totalEntities >= 20) {
    entityCountScore = 95;
  } else if (totalEntities >= 10) {
    entityCountScore = 85;
  } else if (totalEntities >= 5) {
    entityCountScore = 70;
  } else if (totalEntities >= 2) {
    entityCountScore = 55;
  } else {
    entityCountScore = 35;
  }
  entityCountScore = clampScore(entityCountScore);

  // Component 2: Entity diversity score — number of unique entity types
  let entityDiversityScore: number;
  const uniqueTypes = Object.keys(entityCounts).filter((t) => VALUABLE_ENTITY_TYPES.has(t));
  if (entityDiversity >= 5) {
    entityDiversityScore = 95;
  } else if (entityDiversity >= 4) {
    entityDiversityScore = 85;
  } else if (entityDiversity >= 3) {
    entityDiversityScore = 72;
  } else if (entityDiversity >= 2) {
    entityDiversityScore = 55;
  } else if (entityDiversity >= 1) {
    entityDiversityScore = 40;
  } else {
    entityDiversityScore = 20;
  }
  entityDiversityScore = clampScore(entityDiversityScore);

  // Component 3: Entity confidence score — average confidence across entity signals
  const avgConfidence = entitySignals.length > 0
    ? entitySignals.reduce((sum, s) => sum + s.confidence, 0) / entitySignals.length
    : 0;
  const entityConfidenceScore = clampScore(avgConfidence * 100);

  // Component 4: Entity coverage — how many valuable entity types are present
  const valuableTypesPresent = uniqueTypes.length;
  const totalValuableTypes = VALUABLE_ENTITY_TYPES.size;
  const entityCoverageScore = clampScore((valuableTypesPresent / totalValuableTypes) * 100);

  const components = {
    entityCountScore,
    entityDiversityScore,
    entityConfidenceScore,
    entityCoverageScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["script_only_dom", "encoding_failure", "truncated_html"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.83;
  if (totalEntities < 5) confidence -= 0.1;
  if (entityDiversity < 2) confidence -= 0.1;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${totalEntities} unique entities across ${entityDiversity} types`,
    `Entity types: ${Object.entries(entityCounts).map(([t, c]) => `${t}(${c})`).join(", ")}`,
    `Average entity confidence: ${(avgConfidence * 100).toFixed(0)}%`,
    `Valuable type coverage: ${valuableTypesPresent}/${totalValuableTypes}`,
  ];

  const weaknesses: string[] = [];
  if (totalEntities < 5) weaknesses.push(`Only ${totalEntities} entities detected — too few for robust entity recognition`);
  if (entityDiversity < 2) weaknesses.push(`Only ${entityDiversity} entity type(s) — low entity diversity`);
  if (avgConfidence < 0.6) weaknesses.push(`Low average entity confidence (${(avgConfidence * 100).toFixed(0)}%) — entities may be unreliable`);
  if (valuableTypesPresent < 2) weaknesses.push("Few valuable entity types (person, organization, location, date) detected");
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (totalEntities < 5) {
    recommendations.push(rec("entityRecognition", "content", "medium", "Include more named entities (people, organizations, locations, dates) in content for better machine comprehension.", recIndex++));
  }
  if (entityDiversity < 3) {
    recommendations.push(rec("entityRecognition", "metadata", "medium", "Add structured data with entity types (Person, Organization, Place) to improve entity recognition.", recIndex++));
  }
  if (valuableTypesPresent < 2) {
    recommendations.push(rec("entityRecognition", "content", "low", "Diversify content to include different entity types (dates, quantities, products) for richer machine comprehension.", recIndex++));
  }

  return createScoredResult("entityRecognition", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      totalEntities,
      entityDiversity,
      entityCounts,
      avgConfidence: Math.round(avgConfidence * 10000) / 10000,
      valuableTypesPresent,
      totalValuableTypes,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
