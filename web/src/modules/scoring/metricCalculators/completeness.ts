/**
 * Completeness Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: headings, paragraphs, lists, tables, semantic, structuredContent
 * Formula: weightedSum(contentCoverageScore, sectionDiversityScore, mediaCompletenessScore, metadataCompletenessScore)
 * Contamination impact: boilerplate_only, script_only_dom reduce score.
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
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES, rec } from "../recommendations";

/** Weights for completeness components. */
const COMPONENT_WEIGHTS = {
  contentCoverageScore: 0.35,
  sectionDiversityScore: 0.25,
  mediaCompletenessScore: 0.15,
  metadataCompletenessScore: 0.25,
} as const;

/** Content section types to check for coverage. */
const CONTENT_SECTION_TYPES = [
  "headings", "paragraphs", "lists", "tables", "links",
  "semantic", "structuredContent",
] as const;

/**
 * Calculate the Completeness metric score.
 */
export function calculateCompleteness(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;

  const headingCount = countContentSignals(normalized.headings);
  const paragraphCount = countContentSignals(normalized.paragraphs);
  const listCount = countContentSignals(normalized.lists);
  const tableCount = countContentSignals(normalized.tables);
  const linkCount = countContentSignals(normalized.links);
  const semanticCount = countContentSignals(normalized.semantic);
  const structuredContentCount = countContentSignals(normalized.structuredContent);

  const totalContentSignals = headingCount + paragraphCount + listCount + tableCount + linkCount + semanticCount + structuredContentCount;

  if (totalContentSignals === 0) {
    return createInsufficientResult(
      "completeness",
      "No content signals available for completeness analysis",
      { totalContentSignals: 0 },
    );
  }

  // Component 1: Content coverage — volume of content signals
  let contentCoverageScore: number;
  if (totalContentSignals > 50) {
    contentCoverageScore = 95;
  } else if (totalContentSignals > 25) {
    contentCoverageScore = 85;
  } else if (totalContentSignals > 10) {
    contentCoverageScore = 70;
  } else if (totalContentSignals > 5) {
    contentCoverageScore = 55;
  } else {
    contentCoverageScore = 30;
  }
  contentCoverageScore = clampScore(contentCoverageScore);

  // Component 2: Section diversity — how many different content types are present
  const sectionCounts: Record<string, number> = {
    headings: headingCount,
    paragraphs: paragraphCount,
    lists: listCount,
    tables: tableCount,
    links: linkCount,
    semantic: semanticCount,
    structuredContent: structuredContentCount,
  };
  const nonEmptySections = Object.values(sectionCounts).filter((c) => c > 0).length;
  const sectionDiversityScore = clampScore((nonEmptySections / CONTENT_SECTION_TYPES.length) * 100);

  // Component 3: Media completeness — tables and lists indicate rich content
  const hasTables = tableCount > 0;
  const hasLists = listCount > 0;
  const hasStructuredContent = structuredContentCount > 0;
  let mediaCompletenessScore = 0;
  if (hasLists) mediaCompletenessScore += 35;
  if (hasTables) mediaCompletenessScore += 35;
  if (hasStructuredContent) mediaCompletenessScore += 30;
  mediaCompletenessScore = clampScore(mediaCompletenessScore);

  // Component 4: Metadata completeness — check absence for metadata-related categories
  const absenceCategories = ctx.absenceCategories;
  let metadataPresent = 0;
  let metadataTotal = 6;
  if (!absenceCategories.has("title")) metadataPresent++;
  if (!absenceCategories.has("meta_description")) metadataPresent++;
  if (!absenceCategories.has("canonical_url")) metadataPresent++;
  if (!absenceCategories.has("open_graph_title")) metadataPresent++;
  if (!absenceCategories.has("language_declaration")) metadataPresent++;
  if (!absenceCategories.has("structured_data")) metadataPresent++;
  const metadataCompletenessScore = clampScore((metadataPresent / metadataTotal) * 100);

  const components = {
    contentCoverageScore,
    sectionDiversityScore,
    mediaCompletenessScore,
    metadataCompletenessScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["boilerplate_only", "script_only_dom", "truncated_html"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.80;
  if (totalContentSignals < 10) confidence -= 0.15;
  if (nonEmptySections < 3) confidence -= 0.1;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `Total content signals: ${totalContentSignals}`,
    `Section diversity: ${nonEmptySections}/${CONTENT_SECTION_TYPES.length} types populated`,
    `Headings: ${headingCount}, Paragraphs: ${paragraphCount}, Lists: ${listCount}, Tables: ${tableCount}`,
    `Media: lists=${hasLists}, tables=${hasTables}, structuredContent=${hasStructuredContent}`,
    `Metadata: ${metadataPresent}/${metadataTotal} essential metadata fields present`,
  ];

  const weaknesses: string[] = [];
  if (totalContentSignals < 10) weaknesses.push("Very low content volume — page may be too sparse");
  if (nonEmptySections < 3) weaknesses.push(`Only ${nonEmptySections} content types present — low content diversity`);
  if (!hasLists && !hasTables) weaknesses.push("No lists or tables — content lacks structured data formats");
  if (metadataPresent < 3) weaknesses.push(`${metadataTotal - metadataPresent} essential metadata fields missing`);
  if (absenceCategories.has("structured_data")) weaknesses.push("Absence: no structured data (JSON-LD/microdata) found");
  if (absenceCategories.has("meta_description")) weaknesses.push("Absence: no meta description found");
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (totalContentSignals < 10) {
    recommendations.push(REC_TEMPLATES.content.addContent("completeness", recIndex++));
  }
  if (metadataPresent < metadataTotal) {
    if (absenceCategories.has("meta_description")) {
      recommendations.push(REC_TEMPLATES.metadata.addMetaDescription("completeness", recIndex++));
    }
    if (absenceCategories.has("structured_data")) {
      recommendations.push(REC_TEMPLATES.metadata.addJsonLd("completeness", recIndex++));
    }
    if (absenceCategories.has("canonical_url")) {
      recommendations.push(REC_TEMPLATES.metadata.addCanonical("completeness", recIndex++));
    }
  }
  if (!hasLists && !hasTables) {
    recommendations.push(rec("completeness", "content", "low", "Add lists or tables to structure data for better machine comprehension.", recIndex++));
  }

  return createScoredResult("completeness", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      totalContentSignals,
      headingCount, paragraphCount, listCount, tableCount, linkCount, semanticCount, structuredContentCount,
      nonEmptySections,
      hasTables, hasLists, hasStructuredContent,
      metadataPresent, metadataTotal,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
