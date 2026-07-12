/**
 * Evidence Aggregator — Production Version (ACE v1.2)
 *
 * Orchestrates all extraction modules in deterministic order.
 * Handles contamination, DOM corruption, rendered DOM diagnostics,
 * lazy-load detection, Elementor detection, and structural consistency.
 */

import type {
  AceEvidenceResult,
  EvidenceSection,
  ExtractionDiagnostics,
  RenderingDiagnostics,
  StructuralConsistencyDiagnostics,
} from "@/types";

import {
  parseHtmlToDom,
  extractVisibleText,
  extractMainContent,
  detectHydrationShell,
  detectScriptOnlyDom,
  detectBoilerplateDom,
  detectShadowDom,
  detectMalformedDom,
  detectOversizedHtml,
  detectEncodingFailure,
  isMidSentenceTruncation,
} from "./domParser";

import { hasLazyLoadPatterns } from "./lazyLoadDetector";
import { hasElementorPatterns } from "./elementorDetector";

import { detectContamination } from "./contaminationDetector";
import { detectAbsence } from "./absenceDetector";
import { extractMetadata } from "./metadataExtractor";
import { extractHeadings } from "./headingExtractor";
import { extractParagraphs } from "./paragraphExtractor";
import { extractLists } from "./listExtractor";
import { extractTables } from "./tableExtractor";
import { extractLinks } from "./linkExtractor";
import { extractAccessibility } from "./accessibilityExtractor";
import { extractStructuredData } from "./structuredDataExtractor";
import { buildHierarchy } from "./hierarchyBuilder";
import { analyzeExtractability } from "./extractabilityAnalyzer";
import { extractSemanticHtml } from "./semanticHtmlExtractor";
import { extractSemanticStructure } from "./semanticStructureExtractor";
import { extractSemanticHeadings } from "./semanticHeadingExtractor";
import { extractSemanticParagraphs } from "./semanticParagraphExtractor";
import { extractSemanticLists } from "./semanticListExtractor";
import { extractSemanticTables } from "./semanticTableExtractor";
import { extractSemanticLinks } from "./semanticLinkExtractor";
import { extractEntities } from "./entityExtractor";
import { extractDomainProfile } from "./domainProfileExtractor";
import { extractStructuredContent } from "./structuredContentExtractor";
import { extractRedundancy } from "./redundancyExtractor";
import { extractAnchorText } from "./anchorTextExtractor";

import { createContaminationDiagnostics } from "./contaminationDiagnostics";

/** Rendered DOM result passed from inputHandlers when iframe rendering is used. */
interface RenderedDomInput {
  rendered: boolean;
  html?: string;
  scrollSteps?: number;
  contentGrowth?: number;
  lazyLoadTriggered?: boolean;
  elementorDetected?: boolean;
  contaminationFlags?: string[];
  error?: string;
}

/**
 * Main evidence extraction function.
 * Runs all extractors in deterministic order on the same DOM snapshot.
 * @param html Raw or rendered HTML string to extract evidence from.
 * @param url Source URL for the evidence.
 * @param renderedDomResult Optional rendered DOM diagnostics from iframe rendering.
 * @returns Complete AceEvidenceResult with all extracted evidence sections.
 */
export function extractEvidenceFromHtmlString(
  html: string,
  url: string,
  renderedDomResult: RenderedDomInput | null = null,
): AceEvidenceResult {
  const timestamp = Date.now();
  const contaminationCollector = createContaminationDiagnostics();

  // 1. Parse HTML (raw or rendered)
  const htmlToParse = renderedDomResult?.rendered ? renderedDomResult.html ?? html : html;
  const { doc, parseErrors, domCorruption, domCorruptionReason } = parseHtmlToDom(htmlToParse);

  if (parseErrors.length > 0) {
    contaminationCollector.recordParserErrors(parseErrors);
  }
  if (domCorruption) {
    contaminationCollector.recordDomCorruption(domCorruptionReason ?? "DOM corruption detected");
  }

  // 2. Contamination detection
  const contaminationResult = detectContamination(doc, htmlToParse, contaminationCollector);

  // 3. Basic diagnostics
  const visibleText = extractVisibleText(doc);
  const mainContent = extractMainContent(doc);
  const mainText = extractVisibleTextFromElement(mainContent);

  // 4. Structural extractors (safe execution)
  const metadata = safeExtract(() => extractMetadata(doc));
  const headings = safeExtract(() => extractHeadings(doc));
  const paragraphs = safeExtract(() => extractParagraphs(doc));
  const lists = safeExtract(() => extractLists(doc));
  const tables = safeExtract(() => extractTables(doc));
  const links = safeExtract(() => extractLinks(doc, url));
  const accessibility = safeExtract(() => extractAccessibility(doc));
  const structuredData = safeExtract(() => extractStructuredData(doc));

  const hierarchy = safeExtract(() => buildHierarchy(doc));

  // 5. Semantic extractors
  const semanticHtml = safeExtract(() => extractSemanticHtml(doc));
  const semanticStructure = safeExtract(() => extractSemanticStructure(doc));
  const semanticHeadings = safeExtract(() => extractSemanticHeadings(doc));
  const semanticParagraphs = safeExtract(() => extractSemanticParagraphs(doc));
  const semanticLists = safeExtract(() => extractSemanticLists(doc));
  const semanticTables = safeExtract(() => extractSemanticTables(doc));
  const semanticLinks = safeExtract(() => extractSemanticLinks(doc, url));

  // 6. Analytical extractors
  const entities = safeExtract(() => extractEntities(doc));
  const domainProfile = safeExtract(() => extractDomainProfile(doc));
  const structuredContent = safeExtract(() => extractStructuredContent(doc));
  const extractability = safeExtract(() => analyzeExtractability(doc));
  const redundancy = safeExtract(() => extractRedundancy(doc));
  const anchorText = safeExtract(() => extractAnchorText(doc));

  // 7. Absence detection
  const absence = safeExtract(() => detectAbsence(doc));

  // 8. Structural consistency validation
  const headingExtractorCount = headings?.[0]?.signals.length ?? 0;
  const hierarchyHeadingCount = countHierarchyHeadings(hierarchy);
  const semanticStructureHeadingCount = semanticStructure?.[0]?.signals.length ?? 0;
  const paragraphExtractorCount = paragraphs?.[0]?.signals.length ?? 0;
  const extractabilityTextLength = extractability?.[0]?.signals.reduce(
    (sum: number, s) => sum + (s.value?.length ?? 0), 0
  ) ?? 0;

  const headingsConsistent = Math.abs(headingExtractorCount - hierarchyHeadingCount) <= 2 &&
    Math.abs(headingExtractorCount - semanticStructureHeadingCount) <= 2;

  const contradictions: string[] = [];
  if (!headingsConsistent) {
    contradictions.push(
      `Heading count mismatch: extractor=${headingExtractorCount}, hierarchy=${hierarchyHeadingCount}, semanticStructure=${semanticStructureHeadingCount}`
    );
  }

  const rendering: RenderingDiagnostics | undefined = renderedDomResult
    ? {
        rendered: renderedDomResult.rendered,
        lazyLoadTriggered: renderedDomResult.lazyLoadTriggered ?? false,
        elementorDetected: renderedDomResult.elementorDetected ?? false,
        scrollSteps: renderedDomResult.scrollSteps ?? 0,
        contentGrowth: renderedDomResult.contentGrowth ?? 0,
        renderingError: renderedDomResult.error,
      }
    : undefined;

  const structuralConsistency: StructuralConsistencyDiagnostics = {
    headingExtractorCount,
    hierarchyHeadingCount,
    semanticStructureHeadingCount,
    headingsConsistent,
    paragraphExtractorCount,
    extractabilityTextLength,
    hasContradictions: contradictions.length > 0,
    contradictions,
  };

  // 9. Mid-sentence truncation check (non-critical warning, NOT dom_corruption)
  const midSentenceTruncated = isMidSentenceTruncation(visibleText);
  if (midSentenceTruncated) {
    contradictions.push("Mid-sentence truncation detected in visible text");
    contaminationCollector.recordContamination(
      "evidence_layer",
      "mid_sentence_truncation",
      "Visible text appears to end mid-word — content may be truncated",
      "warning",
      false,
    );
  }

  // 10. Build diagnostics
  const diagnostics: ExtractionDiagnostics = {
    htmlSize: htmlToParse.length,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,

    // DOM contamination diagnostics
    hydrationShell: detectHydrationShell(doc),
    shadowDom: detectShadowDom(doc),
    scriptOnlyDom: detectScriptOnlyDom(doc),
    boilerplateOnly: detectBoilerplateDom(doc),
    oversizedHtml: detectOversizedHtml(htmlToParse),
    encodingFailure: detectEncodingFailure(htmlToParse),
    malformedDom: detectMalformedDom(doc),

    // Lazy-load / Elementor detection
    rendering,
    structuralConsistency,

    // Structural diagnostics
    visibleTextLength: visibleText.length,
    mainContentFound: mainText.length > 80,
    domCorruption,
    domCorruptionReason,

    // Truncation detection
    truncatedHtml:
      htmlToParse.length > 100 &&
      (!htmlToParse.includes("</html>") || !htmlToParse.includes("</body>")),

    // Contamination diagnostics summary
    contaminationDiagnostics: contaminationCollector.build(),
  };

  // 11. Determine contamination flags
  const allFlags = contaminationCollector.getFlags();
  const isContaminated = allFlags.length > 0;
  const contaminationType = contaminationCollector.getPrimaryType();

  // 12. Build final result
  const result: AceEvidenceResult = {
    url,
    timestamp,

    metadata: metadata ?? { contentLength: 0 },
    headings: headings ?? [],
    paragraphs: paragraphs ?? [],
    lists: lists ?? [],
    tables: tables ?? [],
    links: links ?? [],
    accessibility: accessibility ?? [],
    structuredData: structuredData ?? [],
    semantic: semanticHtml ?? [],
    semanticStructure: semanticStructure ?? [],
    structuredContent: structuredContent ?? [],
    extractability: extractability ?? [],
    redundancy: redundancy ?? [],
    domainProfile: domainProfile ?? [],
    entities: entities ?? [],
    anchorText: anchorText ?? [],
    hierarchy: hierarchy ?? null,
    absence: absence ?? [],

    contamination: isContaminated,
    contaminationType,
    contaminationFlags: allFlags,

    diagnostics,
    rawVisibleText: visibleText,
  };

  return result;
}

/**
 * Create an empty evidence result for error/edge cases.
 * Used when fetch fails, input is empty, or content cannot be parsed.
 * @param url Source URL.
 * @param errorMessage Error or reason for the empty result.
 * @param contaminationFlags Contamination flags to set.
 * @returns Minimal AceEvidenceResult with contamination flags.
 */
export function createEmptyEvidenceResult(
  url: string,
  errorMessage: string,
  contaminationFlags: string[] = [],
): AceEvidenceResult {
  const timestamp = Date.now();
  const collector = createContaminationDiagnostics();

  // Record each contamination flag
  for (const flag of contaminationFlags) {
    const isCritical = ["fetch_failure", "hydration_shell", "script_only_dom", "dom_corruption", "invalid_url", "unsupported_protocol"].includes(flag);
    collector.recordContamination(
      "fetcher",
      flag,
      errorMessage,
      isCritical ? "critical" : "warning",
      isCritical,
    );
  }

  const diagnostics: ExtractionDiagnostics = {
    htmlSize: 0,
    parseErrors: undefined,
    hydrationShell: false,
    shadowDom: false,
    scriptOnlyDom: false,
    boilerplateOnly: false,
    oversizedHtml: false,
    encodingFailure: false,
    malformedDom: false,
    visibleTextLength: 0,
    mainContentFound: false,
    domCorruption: false,
    truncatedHtml: false,
    contaminationDiagnostics: collector.build(),
  };

  return {
    url,
    timestamp,
    metadata: { contentLength: 0 },
    headings: [],
    paragraphs: [],
    lists: [],
    tables: [],
    links: [],
    accessibility: [],
    structuredData: [],
    semantic: [],
    semanticStructure: [],
    structuredContent: [],
    extractability: [],
    redundancy: [],
    domainProfile: [],
    entities: [],
    anchorText: [],
    hierarchy: null,
    absence: [],
    contamination: contaminationFlags.length > 0,
    contaminationType: contaminationFlags[0],
    contaminationFlags,
    diagnostics,
    rawVisibleText: "",
  };
}

/**
 * Get a quick summary of evidence signal counts from an AceEvidenceResult.
 * @param result The evidence extraction result to summarize.
 * @returns Object with counts for each evidence category.
 */
export function getEvidenceSummary(result: AceEvidenceResult): {
  headings: number;
  paragraphs: number;
  lists: number;
  tables: number;
  links: number;
  accessibility: number;
  structuredData: number;
  semantic: number;
  semanticStructure: number;
  entities: number;
  absence: number;
  totalSignals: number;
  visibleTextLength: number;
  contamination: boolean;
  contaminationFlags: string[];
} {
  const countSignals = (sections: EvidenceSection[] | undefined): number =>
    sections?.reduce((sum, s) => sum + (s.signals?.length ?? 0), 0) ?? 0;

  const headings = countSignals(result.headings);
  const paragraphs = countSignals(result.paragraphs);
  const lists = countSignals(result.lists);
  const tables = countSignals(result.tables);
  const links = countSignals(result.links);
  const accessibility = countSignals(result.accessibility);
  const structuredData = countSignals(result.structuredData);
  const semantic = countSignals(result.semantic);
  const semanticStructure = countSignals(result.semanticStructure);
  const entities = countSignals(result.entities);
  const absence = countSignals(result.absence);

  const totalSignals =
    headings + paragraphs + lists + tables + links + accessibility +
    structuredData + semantic + semanticStructure + entities + absence;

  return {
    headings,
    paragraphs,
    lists,
    tables,
    links,
    accessibility,
    structuredData,
    semantic,
    semanticStructure,
    entities,
    absence,
    totalSignals,
    visibleTextLength: result.rawVisibleText?.length ?? result.diagnostics?.visibleTextLength ?? 0,
    contamination: result.contamination,
    contaminationFlags: result.contaminationFlags ?? [],
  };
}

// ─── Internal Helpers ──────────────────────────────────────────────

/** Safe wrapper to prevent one extractor from crashing the entire layer. */
function safeExtract<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (err) {
    console.error("Extractor failed:", err);
    return null;
  }
}

/** Extract visible text from a single element. */
function extractVisibleTextFromElement(el: Element | null): string {
  if (!el) return "";
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("script, style, template").forEach((e: Element) => e.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** Recursively count headings in a hierarchy node tree. */
function countHierarchyHeadings(node: import("@/types").HierarchyNode | null): number {
  if (!node) return 0;
  const isHeading = /^h[1-6]$/i.test(node.tag);
  let count = isHeading ? 1 : 0;
  for (const child of node.children ?? []) {
    count += countHierarchyHeadings(child);
  }
  return count;
}
