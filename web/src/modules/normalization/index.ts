/**
 * Normalization Module — Phase 3
 * Complete normalization layer with text, structure, semantic, and analytical normalizers.
 *
 * Public API:
 * - normalizeEvidence(evidence) — full normalization
 * - normalizeForScoring(evidence) — normalization optimized for scoring input
 * - normalizeForReporting(evidence) — normalization optimized for reporting input
 * - getNormalizedSummary(result) — quick signal counts
 * - createEmptyNormalizedResult(url, warnings, errors) — empty fallback
 *
 * Text Utilities:
 * - normalizeText, normalizeSentences, normalizeWords
 * - normalizeForComparison, normalizeHeadingText, normalizeParagraphText
 * - tokenizeParagraphs, tokenizeListItems, tokenizeTableRows
 * - buildNormalizedText
 *
 * Structure Utilities:
 * - normalizeSection, normalizeSections, normalizeSignal
 * - normalizeHeadingLevels, normalizeSectionOrdering
 * - flattenListItems, normalizeCrossReferences
 * - deduplicateSignals, generateSectionId
 */

// ─── Orchestrator (public API) ─────────────────────────────────────
export {
  normalizeEvidence,
  normalizeForScoring,
  normalizeForReporting,
  getNormalizedSummary,
  createEmptyNormalizedResult,
} from "./normalizationLayer";

// ─── Text Normalizer ────────────────────────────────────────────────
export {
  normalizeText,
  normalizeSentences,
  normalizeWords,
  normalizeForComparison,
  normalizeHeadingText,
  normalizeParagraphText,
  tokenizeParagraphs,
  tokenizeListItems,
  tokenizeTableRows,
  buildNormalizedText,
} from "./textNormalizer";

// ─── Structure Normalizer ───────────────────────────────────────────
export {
  normalizeSection,
  normalizeSections,
  normalizeSignal,
  normalizeHeadingLevels,
  normalizeSectionOrdering,
  flattenListItems,
  normalizeCrossReferences,
  deduplicateSignals,
  generateSectionId,
  resetSectionIdCounter,
} from "./structureNormalizer";

// ─── Semantic Normalizer ────────────────────────────────────────────
export {
  normalizeSemanticHtml,
  normalizeSemanticStructure,
  normalizeSemanticHeadings,
  normalizeSemanticParagraphs,
  normalizeSemanticLists,
  normalizeSemanticTables,
  normalizeSemanticLinks,
  normalizeAllSemantic,
} from "./semanticNormalizer";

// ─── Specialized Normalizers ────────────────────────────────────────
export { normalizeStructuredContent } from "./structuredContentNormalizer";
export { normalizeDomainProfile, getPrimaryDomainType } from "./domainProfileNormalizer";
export { normalizeExtractability } from "./extractabilityNormalizer";
export { normalizeRedundancy } from "./redundancyNormalizer";
export { normalizeAnchorText } from "./anchorTextNormalizer";
export { normalizeAccessibility } from "./accessibilityNormalizer";
export { normalizeStructuredData } from "./structuredDataNormalizer";
export { normalizeEntities, getEntityCounts } from "./entityNormalizer";
export { normalizeHierarchy, getHierarchyStats, detectHierarchyIssues } from "./hierarchyNormalizer";
export { normalizeAbsence, getCriticalAbsence } from "./absenceNormalizer";
export {
  normalizeContamination,
  isCriticalContamination,
  getContaminationSeverity,
} from "./contaminationNormalizer";

// ─── Diagnostics ─────────────────────────────────────────────────────
export {
  NormalizationDiagnostics,
  createDiagnostics,
  type NormalizationDiagnostic,
} from "./normalizationDiagnostics";
