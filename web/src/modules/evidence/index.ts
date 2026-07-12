/**
 * Evidence Extraction Module — Phase 2
 * Full evidence extraction layer with structural, semantic, and analytical extractors.
 *
 * Public API:
 * - extractEvidenceFromUrl(url) — fetch + extract
 * - extractEvidenceFromHtml(html, url?) — parse HTML + extract
 * - extractEvidenceFromText(text, url?) — wrap text + extract
 * - extractEvidenceFromMarkdown(md, url?) — convert MD + extract
 * - extractEvidenceFromJson(json, url?) — convert JSON + extract
 * - extractEvidenceFromHtmlString(html, url) — core aggregator
 * - getEvidenceSummary(result) — quick signal counts
 *
 * DOM Utilities:
 * - parseHtmlToDom, extractVisibleText, extractMainContent
 * - detectHydrationShell, detectShadowDom, detectMalformedDom
 * - detectScriptOnlyDom, detectBoilerplateDom
 * - detectOversizedHtml, detectEncodingFailure
 *
 * Fetcher:
 * - fetchRenderedHtml(url), fetchRawHtml(url)
 */

// ─── Input Handlers (public API) ───────────────────────────────────
export {
  extractEvidenceFromUrl,
  extractEvidenceFromHtml,
  extractEvidenceFromText,
  extractEvidenceFromMarkdown,
  extractEvidenceFromJson,
} from "./inputHandlers";

// ─── Evidence Aggregator ───────────────────────────────────────────
export {
  extractEvidenceFromHtmlString,
  createEmptyEvidenceResult,
  getEvidenceSummary,
} from "./evidenceLayer";

// ─── DOM Parser Utilities ──────────────────────────────────────────
export {
  parseHtmlToDom,
  extractVisibleText,
  extractMainContent,
  detectHydrationShell,
  detectShadowDom,
  detectMalformedDom,
  detectScriptOnlyDom,
  detectBoilerplateDom,
  detectOversizedHtml,
  detectEncodingFailure,
  generateSelector,
  truncateText,
  isMidSentenceTruncation,
} from "./domParser";

// ─── Fetcher ───────────────────────────────────────────────────────
export {
  fetchRenderedHtml,
  fetchRawHtml,
  type FetchResult,
} from "./fetcher";

// ─── Structural Extractors ─────────────────────────────────────────
export { extractMetadata } from "./metadataExtractor";
export { extractHeadings } from "./headingExtractor";
export { extractParagraphs } from "./paragraphExtractor";
export { extractLists } from "./listExtractor";
export { extractTables } from "./tableExtractor";
export { extractLinks } from "./linkExtractor";
export { extractAccessibility } from "./accessibilityExtractor";
export { extractStructuredData } from "./structuredDataExtractor";
export { buildHierarchy } from "./hierarchyBuilder";
export { analyzeExtractability } from "./extractabilityAnalyzer";
export { detectAbsence } from "./absenceDetector";
export { detectContamination } from "./contaminationDetector";

// ─── Semantic Extractors ───────────────────────────────────────────
export { extractSemanticHtml } from "./semanticHtmlExtractor";
export { extractSemanticStructure } from "./semanticStructureExtractor";
export { extractSemanticHeadings } from "./semanticHeadingExtractor";
export { extractSemanticParagraphs } from "./semanticParagraphExtractor";
export { extractSemanticLists } from "./semanticListExtractor";
export { extractSemanticTables } from "./semanticTableExtractor";
export { extractSemanticLinks } from "./semanticLinkExtractor";
export { extractEntities } from "./entityExtractor";
export { extractDomainProfile } from "./domainProfileExtractor";
export { extractStructuredContent } from "./structuredContentExtractor";
export { extractRedundancy } from "./redundancyExtractor";
export { extractAnchorText } from "./anchorTextExtractor";

// ─── Contamination Diagnostics ─────────────────────────────────────
export {
  createContaminationDiagnostics,
  type ContaminationDiagnosticsCollector,
  type ContaminationDiagnosticsSummary,
} from "./contaminationDiagnostics";

// ─── Rendering & Lazy-Load (ACE v1.2 DOM extraction) ──────────────
export {
  renderDomInIframe,
  shouldRenderDom,
  type RenderedDomResult,
} from "./renderedDomExtractor";
export {
  hasLazyLoadPatterns,
  detectLazyLoadElements,
  countUnloadedLazyElements,
  detectIntersectionObserverUsage,
  getLazyLoadSummary,
} from "./lazyLoadDetector";
export {
  isElementorPage,
  hasElementorPatterns,
  detectElementorSections,
  detectElementorInnerSections,
  detectElementorWidgets,
  detectElementorColumns,
  extractElementorText,
  isElementorFrontendReady,
  getElementorSummary,
} from "./elementorDetector";

// ─── Legacy compat (Phase 1 function signature) ────────────────────
export { extractEvidenceFromFile } from "./legacyCompat";
