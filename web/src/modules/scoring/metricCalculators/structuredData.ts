/**
 * Structured Data Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: structuredData (JSON-LD, Microdata, RDFa)
 * Formula: weightedSum(jsonLdScore, microdataScore, schemaTypeDiversityScore, validityScore)
 * Contamination impact: malformed_dom, truncated_html reduce score.
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

/** Weights for structured data components. */
const COMPONENT_WEIGHTS = {
  jsonLdScore: 0.40,
  microdataScore: 0.20,
  schemaTypeDiversityScore: 0.20,
  validityScore: 0.20,
} as const;

/**
 * Calculate the Structured Data metric score.
 */
export function calculateStructuredData(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const structuredDataSignals = getAllSignals(normalized.structuredData).filter(
    (s) => !s.type.endsWith("_summary"),
  );

  if (structuredDataSignals.length === 0) {
    if (ctx.absenceCategories.has("structured_data")) {
      return createInsufficientResult(
        "structuredData",
        "No structured data found — JSON-LD, microdata, and RDFa are all absent",
        { signalCount: 0 },
      );
    }
    return createInsufficientResult(
      "structuredData",
      "No structured data evidence available",
      { signalCount: 0 },
    );
  }

  const summary = findSummarySignal(normalized.structuredData);
  const jsonLdCount = getMetaNum(summary, "jsonLdCount") ?? 0;
  const microdataCount = getMetaNum(summary, "microdataCount") ?? 0;
  const rdfaCount = getMetaNum(summary, "rdfaCount") ?? 0;
  const invalidCount = getMetaNum(summary, "invalidCount") ?? 0;
  const schemaTypes = (summary?.metadata?.schemaTypes as string[]) ?? [];

  // Component 1: JSON-LD score — most valuable structured data format
  let jsonLdScore: number;
  if (jsonLdCount >= 3) {
    jsonLdScore = 95;
  } else if (jsonLdCount >= 2) {
    jsonLdScore = 88;
  } else if (jsonLdCount >= 1) {
    jsonLdScore = 75;
  } else {
    jsonLdScore = 20;
  }
  jsonLdScore = clampScore(jsonLdScore);

  // Component 2: Microdata score
  let microdataScore: number;
  if (microdataCount >= 2) {
    microdataScore = 80;
  } else if (microdataCount >= 1) {
    microdataScore = 65;
  } else {
    microdataScore = 30;
  }
  microdataScore = clampScore(microdataScore);

  // Component 3: Schema type diversity
  const uniqueSchemaTypes = [...new Set(schemaTypes)].filter((t) => t !== "unknown");
  let schemaTypeDiversityScore: number;
  if (uniqueSchemaTypes.length >= 4) {
    schemaTypeDiversityScore = 95;
  } else if (uniqueSchemaTypes.length >= 3) {
    schemaTypeDiversityScore = 85;
  } else if (uniqueSchemaTypes.length >= 2) {
    schemaTypeDiversityScore = 70;
  } else if (uniqueSchemaTypes.length >= 1) {
    schemaTypeDiversityScore = 55;
  } else {
    schemaTypeDiversityScore = 25;
  }
  schemaTypeDiversityScore = clampScore(schemaTypeDiversityScore);

  // Component 4: Validity — penalize invalid JSON-LD
  const totalValid = jsonLdCount + microdataCount + rdfaCount;
  const totalAll = totalValid + invalidCount;
  let validityScore: number;
  if (totalAll === 0) {
    validityScore = 30;
  } else if (invalidCount === 0) {
    validityScore = 95;
  } else {
    validityScore = clampScore((totalValid / totalAll) * 100);
  }
  validityScore = clampScore(validityScore);

  const components = {
    jsonLdScore,
    microdataScore,
    schemaTypeDiversityScore,
    validityScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["malformed_dom", "truncated_html", "encoding_failure"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.85;
  if (invalidCount > 0) confidence -= 0.1;
  if (jsonLdCount === 0) confidence -= 0.1;
  if (uniqueSchemaTypes.length === 0) confidence -= 0.15;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${jsonLdCount} JSON-LD blocks, ${microdataCount} microdata, ${rdfaCount} RDFa`,
    `Schema types: ${uniqueSchemaTypes.join(", ") || "none"}`,
    `Invalid blocks: ${invalidCount}`,
    `Total structured data signals: ${structuredDataSignals.length}`,
  ];

  const weaknesses: string[] = [];
  if (jsonLdCount === 0) weaknesses.push("No JSON-LD structured data found — the most important format for machine comprehension");
  if (invalidCount > 0) weaknesses.push(`${invalidCount} invalid JSON-LD blocks detected`);
  if (uniqueSchemaTypes.length === 0) weaknesses.push("No recognizable schema.org types detected");
  if (microdataCount === 0 && rdfaCount === 0 && jsonLdCount === 0) {
    weaknesses.push("No structured data of any format detected");
  }
  if (ctx.absenceCategories.has("structured_data")) {
    weaknesses.push("Absence: structured data confirmed missing");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (jsonLdCount === 0) {
    recommendations.push(REC_TEMPLATES.metadata.addJsonLd("structuredData", recIndex++));
  }
  if (invalidCount > 0) {
    recommendations.push({
      id: `structuredData_rec_${recIndex++}`,
      category: "metadata" as const,
      priority: "high" as const,
      message: `Fix ${invalidCount} invalid JSON-LD block(s) — ensure valid JSON syntax and schema.org types.`,
    });
  }
  if (uniqueSchemaTypes.length < 2 && jsonLdCount > 0) {
    recommendations.push({
      id: `structuredData_rec_${recIndex++}`,
      category: "metadata" as const,
      priority: "medium" as const,
      message: "Add more diverse schema.org types (e.g., Article, BreadcrumbList, Organization) for richer machine comprehension.",
    });
  }

  return createScoredResult("structuredData", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      jsonLdCount,
      microdataCount,
      rdfaCount,
      invalidCount,
      schemaTypes: uniqueSchemaTypes,
      totalSignals: structuredDataSignals.length,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
