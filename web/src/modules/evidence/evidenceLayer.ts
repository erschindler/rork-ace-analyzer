/**
 * Evidence Aggregator — Phase 2
 * Orchestrates all extraction modules in a deterministic order.
 * Detects all failure modes, sets contamination metadata,
 * assembles the final AceEvidenceResult.
 *
 * ACE v1.2: Integrates contamination diagnostics, DOM corruption detection,
 * and blocks downstream processing when contamination is detected.
 */

import type {
  AceEvidenceResult,
  EvidenceSection,
  EvidenceMetadata,
  ExtractionDiagnostics,
  HierarchyNode,
} from "@/types";

import {
  parseHtmlToDom,
  extractVisibleText,
  extractVisibleTextFromElement,
  extractMainContent,
  detectHydrationShell,
  detectShadowDom,
  detectMalformedDom,
  detectScriptOnlyDom,
  detectBoilerplateDom,
  detectOversizedHtml,
  detectEncodingFailure,
  isMidSentenceTruncation,
} from "./domParser";

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

import {
  createContaminationDiagnostics,
  type ContaminationDiagnosticsCollector,
  type ContaminationDiagnosticsSummary,
} from "./contaminationDiagnostics";

/**
 * Extract all evidence from an HTML string.
 * This is the core aggregation function that runs all extractors in deterministic order.
 * @param html Raw HTML string.
 * @param url Source URL (or synthetic identifier).
 * @returns Complete AceEvidenceResult with all sections populated.
 */
export function extractEvidenceFromHtmlString(html: string, url: string): AceEvidenceResult {
  const timestamp = Date.now();
  const contaminationCollector = createContaminationDiagnostics();

  // Step 1: Parse HTML to DOM (now includes DOM corruption detection)
  const { doc, parseErrors, domCorruption, domCorruptionReason } = parseHtmlToDom(html);

  // Record parser errors in contamination diagnostics
  if (parseErrors.length > 0) {
    contaminationCollector.recordParserErrors(parseErrors);
  }

  // Record DOM corruption if detected
  if (domCorruption) {
    contaminationCollector.recordDomCorruption(domCorruptionReason ?? "Unknown DOM corruption");
  }

  // Step 2: Run contamination detection (records into collector)
  const { sections: contaminationSections, flags: contaminationFlags, contaminationType } =
    detectContamination(doc, html, contaminationCollector);

  // Step 3: Build diagnostics
  const visibleText = extractVisibleText(doc);
  const mainContent = extractMainContent(doc);
  const mainContentText = mainContent ? extractVisibleTextFromElement(mainContent) : "";

  // Detect truncated HTML
  const truncatedHtml = html.length > 100 && !html.includes("</html>") && !html.includes("</body>");

  const diagnostics: ExtractionDiagnostics = {
    htmlSize: html.length,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,
    hydrationShell: detectHydrationShell(doc),
    shadowDom: detectShadowDom(doc),
    scriptOnlyDom: detectScriptOnlyDom(doc),
    boilerplateOnly: detectBoilerplateDom(doc),
    oversizedHtml: html.length > 5 * 1024 * 1024,
    encodingFailure: html.includes("\uFFFD"),
    malformedDom: detectMalformedDom(doc),
    visibleTextLength: visibleText.length,
    mainContentFound: mainContentText.length > 50,
    domCorruption,
    domCorruptionReason,
    truncatedHtml,
  };

  // Step 4: Run structural extractors (deterministic order)
  const { metadata, sections: metadataSections } = extractMetadata(doc);
  const headingSections = extractHeadings(doc);
  const paragraphSections = extractParagraphs(doc);
  const listSections = extractLists(doc);
  const tableSections = extractTables(doc);
  const linkSections = extractLinks(doc, url);
  const accessibilitySections = extractAccessibility(doc);
  const structuredDataSections = extractStructuredData(doc);

  // Step 5: Build hierarchy
  const hierarchy: HierarchyNode | null = buildHierarchy(doc);

  // Step 6: Run semantic extractors
  const semanticHtmlSections = extractSemanticHtml(doc);
  const semanticStructureSections = extractSemanticStructure(doc);
  const semanticHeadingSections = extractSemanticHeadings(doc);
  const semanticParagraphSections = extractSemanticParagraphs(doc);
  const semanticListSections = extractSemanticLists(doc);
  const semanticTableSections = extractSemanticTables(doc);
  const semanticLinkSections = extractSemanticLinks(doc, url);

  // Step 7: Run analytical extractors
  const entitySections = extractEntities(doc);
  const domainProfileSections = extractDomainProfile(doc);
  const structuredContentSections = extractStructuredContent(doc);
  const extractabilitySections = analyzeExtractability(doc);
  const redundancySections = extractRedundancy(doc);
  const anchorTextSections = extractAnchorText(doc);

  // Step 8: Run absence detector
  const absenceSections = detectAbsence(doc);

  // Step 9: Structural consistency validation
  // ACE v1.2: Detect contradictions between extractors that indicate DOM corruption.
  // All extractors operate on the same DOM snapshot, so heading counts, paragraph
  // counts, and visible text should be consistent. Contradictions indicate DOM
  // corruption or extraction bugs.
  const headingCount = headingSections.reduce((s, sec) => s + sec.count, 0);
  const hierarchyHeadingCount = countHeadingsInHierarchy(hierarchy);
  const semanticStructureCount = semanticStructureSections.reduce((s, sec) => s + sec.count, 0);
  const semanticStructureHeadingCount = semanticStructureSections.reduce(
    (s, sec) => (s + ((sec.metadata?.headingCount as number) ?? 0)), 0,
  );
  const domSemanticElements = doc.querySelectorAll("section, article, nav, aside, header, footer, main");
  const paragraphCount = paragraphSections.reduce((s, sec) => s + sec.count, 0);
  const extractabilityTextLength = extractabilitySections.reduce(
    (s, sec) => s + ((sec.metadata?.fullTextLength as number) ?? 0), 0,
  );

  const contradictions: string[] = [];

  // Check: headingExtractor vs hierarchy heading count
  // The hierarchy builder traverses all ancestor paths of headings, so it should
  // capture at least 50% of headings. A large discrepancy indicates a problem.
  if (headingCount > 0 && hierarchyHeadingCount === 0) {
    contradictions.push(
      `headingExtractor found ${headingCount} headings but hierarchy has 0 — DOM traversal inconsistency`,
    );
  }

  // Check: headingExtractor vs semanticStructure heading count
  // semanticStructure now detects div-based sectioning, so it should find headings
  // in containers. A large discrepancy may indicate extraction inconsistency.
  if (headingCount > 0 && semanticStructureHeadingCount === 0 && domSemanticElements.length === 0) {
    // Only flag as contradiction if there are also no div-based sections detected
    const hasDivSections = semanticStructureSections.some(
      (sec) => (sec.metadata?.containerCount as number) ?? 0 > 0,
    );
    if (!hasDivSections) {
      contradictions.push(
        `headingExtractor found ${headingCount} headings but semanticStructure found 0 in containers`,
      );
    }
  }

  // Check: extractability text length vs visible text length
  // Both should see the same text content. A large discrepancy indicates
  // that extractability is looking at a different part of the DOM.
  if (extractabilityTextLength > 0 && visibleText.length > 0) {
    const ratio = extractabilityTextLength / visibleText.length;
    if (ratio < 0.3 || ratio > 3.0) {
      contradictions.push(
        `extractability text (${extractabilityTextLength} chars) differs significantly from visible text (${visibleText.length} chars)`,
      );
    }
  }

  // Record contradictions as non-critical warnings (not dom_corruption).
  // Structural inconsistencies may indicate extraction edge cases, not
  // necessarily DOM corruption. Only the existing dom_corruption checks
  // (body-only-scripts, parsererror, etc.) set critical contamination.
  if (contradictions.length > 0) {
    for (const contradiction of contradictions) {
      contaminationCollector.recordContamination(
        "evidence_layer",
        "structural_inconsistency",
        contradiction,
        "warning",
        false,
        {
          headingCount, hierarchyHeadingCount, semanticStructureHeadingCount,
          paragraphCount, extractabilityTextLength, visibleTextLength: visibleText.length,
        },
      );
    }
  }

  // Build structural consistency diagnostics
  const headingsConsistent = headingCount === 0 || hierarchyHeadingCount >= Math.floor(headingCount * 0.5);
  diagnostics.structuralConsistency = {
    headingExtractorCount: headingCount,
    hierarchyHeadingCount,
    semanticStructureHeadingCount,
    headingsConsistent,
    paragraphExtractorCount: paragraphCount,
    extractabilityTextLength,
    hasContradictions: contradictions.length > 0,
    contradictions,
  };

  // Only flag as DOM corruption when there are headings but the DOM
  // has NO semantic structure elements at all (section, article, nav, aside, header,
  // footer, main) AND visible text is very low — indicating a truly broken DOM,
  // not just a page that doesn't use HTML5 semantic elements.
  if (headingCount > 0 && semanticStructureCount === 0 && domSemanticElements.length === 0 && visibleText.length < 100) {
    contaminationCollector.recordDomCorruption(
      "Headings found but no semantic structure elements and very low visible text — possible DOM corruption",
      { headingCount, semanticStructureCount, domSemanticElementCount: domSemanticElements.length, visibleTextLength: visibleText.length },
    );
    if (!diagnostics.domCorruption) {
      diagnostics.domCorruption = true;
      diagnostics.domCorruptionReason = "Headings found but no semantic structure elements and very low visible text";
    }
  }

  // Content coverage validation: if the document has substantial visible text
  // but the heading and paragraph extractors found almost nothing, the DOM
  // may be corrupted or the content may be in an unusual format.
  if (visibleText.length > 500 && headingCount === 0 && paragraphCount === 0) {
    contaminationCollector.recordDomCorruption(
      `Substantial visible text (${visibleText.length} chars) but no headings or paragraphs extracted — possible DOM corruption or unusual content structure`,
      { visibleTextLength: visibleText.length, headingCount, paragraphCount },
    );
    if (!diagnostics.domCorruption) {
      diagnostics.domCorruption = true;
      diagnostics.domCorruptionReason = "Visible text present but no structured content (headings/paragraphs) extracted";
    }
  }

  // Mid-sentence truncation detection: if visible text ends mid-sentence,
  // the DOM content may have been truncated during fetch or rendering.
  if (isMidSentenceTruncation(visibleText)) {
    contaminationCollector.recordContamination(
      "evidence_layer",
      "truncated_content",
      "Visible text ends mid-sentence — content may be truncated",
      "warning",
      false,
      { visibleTextLength: visibleText.length },
    );
    if (!diagnostics.truncatedHtml) {
      diagnostics.truncatedHtml = true;
    }
  }

  // Step 10: Build contamination diagnostics summary
  const contaminationDiagnosticsSummary = contaminationCollector.build();

  // Attach summary to diagnostics
  diagnostics.contaminationDiagnostics = contaminationDiagnosticsSummary;

  // Determine final contamination state
  // IMPORTANT: parser_error alone does NOT constitute contamination.
  // The browser's DOMParser handles malformed HTML gracefully, and our
  // tag-mismatch heuristic was removed (it produced false positives by
  // counting tags inside <script>/<style> content). Parser errors are
  // informational diagnostics, not evidence of content corruption.
  const blockingContaminationFlags = contaminationFlags.filter((f) =>
    f !== "parser_error" && f !== "cors_proxy_fallback" && f !== "cors_block",
  );
  const isContaminated = blockingContaminationFlags.length > 0 || domCorruption;
  const finalContaminationType = isContaminated
    ? (contaminationType ?? (domCorruption ? "dom_corruption" : contaminationDiagnosticsSummary.primaryType))
    : undefined;
  const allFlags = [...new Set([
    ...contaminationFlags,
    ...(domCorruption ? ["dom_corruption"] : []),
    ...contaminationDiagnosticsSummary.flags,
  ])];

  // Step 11: Assemble final result
  const result: AceEvidenceResult = {
    url,
    timestamp,
    metadata,
    headings: headingSections,
    paragraphs: paragraphSections,
    lists: listSections,
    tables: tableSections,
    links: linkSections,
    accessibility: accessibilitySections,
    structuredData: structuredDataSections,
    semantic: semanticHtmlSections,
    semanticStructure: semanticStructureSections,
    structuredContent: structuredContentSections,
    extractability: extractabilitySections,
    redundancy: redundancySections,
    domainProfile: domainProfileSections,
    entities: entitySections,
    anchorText: anchorTextSections,
    hierarchy,
    absence: absenceSections,
    contamination: isContaminated,
    contaminationType: finalContaminationType,
    contaminationFlags: allFlags,
    diagnostics,
    rawVisibleText: visibleText,
  };

  return result;
}

/**
 * Create an empty evidence result for error/failure cases.
 * @param url Source URL.
 * @param error Error message.
 * @param contaminationFlags Contamination flags from fetch.
 * @returns AceEvidenceResult with absence and contamination evidence.
 */
export function createEmptyEvidenceResult(
  url: string,
  error?: string,
  contaminationFlags: string[] = [],
): AceEvidenceResult {
  const timestamp = Date.now();
  const collector = createContaminationDiagnostics();

  // Record fetch failure if applicable
  if (error) {
    collector.recordFetchFailure(error);
  }
  for (const flag of contaminationFlags) {
    if (flag === "fetch_failure") continue; // Already recorded above if error
    collector.recordContamination(
      "fetcher",
      flag,
      `Fetch contamination: ${flag}`,
      "critical",
      true,
    );
  }

  const contaminationDiagnosticsSummary = collector.build();

  const absenceSection: EvidenceSection = {
    category: "absence",
    label: "Absence Evidence — Fetch Failure",
    signals: [{
      type: "absence",
      value: error ?? "Unable to extract evidence — content not available",
      confidence: 1.0,
      selector: "body",
      metadata: {
        category: "fetch_failure",
        severity: "critical",
        error,
      },
    }],
    count: 1,
    confidence: 1.0,
    metadata: { missingCount: 1, criticalMissing: ["fetch_failure"] },
  };

  const emptySection: EvidenceSection = {
    category: "contamination",
    label: "Contamination Flags",
    signals: contaminationFlags.map((flag) => ({
      type: "contamination",
      value: `Contamination: ${flag}`,
      confidence: 1.0,
      selector: "html",
      metadata: { contaminationType: flag, severity: "critical" },
    })),
    count: contaminationFlags.length,
    confidence: contaminationFlags.length > 0 ? 1.0 : 0,
    metadata: { isContaminated: true, contaminationFlags },
  };

  const metadata: EvidenceMetadata = {
    contentLength: 0,
  };

  const diagnostics: ExtractionDiagnostics = {
    fetchError: error,
    hydrationShell: false,
    shadowDom: false,
    scriptOnlyDom: true,
    boilerplateOnly: false,
    oversizedHtml: false,
    encodingFailure: false,
    malformedDom: true,
    visibleTextLength: 0,
    mainContentFound: false,
    domCorruption: true,
    domCorruptionReason: "Empty evidence result — no content available",
    truncatedHtml: false,
    contaminationDiagnostics: contaminationDiagnosticsSummary,
  };

  const allFlags = [...new Set([
    ...contaminationFlags,
    ...contaminationDiagnosticsSummary.flags,
  ])];

  return {
    url,
    timestamp,
    metadata,
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
    absence: [absenceSection],
    contamination: true,
    contaminationType: contaminationFlags[0] ?? "fetch_failure",
    contaminationFlags: allFlags,
    diagnostics,
    rawVisibleText: "",
  };
}

/**
 * Get a summary of all evidence sections for quick inspection.
 * @param result The evidence result to summarize.
 * @returns Object with section names and signal counts.
 */
export function getEvidenceSummary(result: AceEvidenceResult): Record<string, number> {
  return {
    headings: result.headings.reduce((s, sec) => s + sec.count, 0),
    paragraphs: result.paragraphs.reduce((s, sec) => s + sec.count, 0),
    lists: result.lists.reduce((s, sec) => s + sec.count, 0),
    tables: result.tables.reduce((s, sec) => s + sec.count, 0),
    links: result.links.reduce((s, sec) => s + sec.count, 0),
    accessibility: result.accessibility.reduce((s, sec) => s + sec.count, 0),
    structuredData: result.structuredData.reduce((s, sec) => s + sec.count, 0),
    semantic: result.semantic.reduce((s, sec) => s + sec.count, 0),
    semanticStructure: result.semanticStructure.reduce((s, sec) => s + sec.count, 0),
    structuredContent: result.structuredContent.reduce((s, sec) => s + sec.count, 0),
    extractability: result.extractability.reduce((s, sec) => s + sec.count, 0),
    redundancy: result.redundancy.reduce((s, sec) => s + sec.count, 0),
    domainProfile: result.domainProfile.reduce((s, sec) => s + sec.count, 0),
    entities: result.entities.reduce((s, sec) => s + sec.count, 0),
    anchorText: result.anchorText.reduce((s, sec) => s + sec.count, 0),
    absence: result.absence.reduce((s, sec) => s + sec.count, 0),
  };
}

// Re-export for use by other modules
export type { ContaminationDiagnosticsCollector, ContaminationDiagnosticsSummary };
export { createContaminationDiagnostics } from "./contaminationDiagnostics";

// ─── Internal helpers ──────────────────────────────────────────────

/**
 * Count heading nodes (h1-h6) in a hierarchy tree.
 * @internal
 */
function countHeadingsInHierarchy(node: import("@/types").HierarchyNode | null): number {
  if (!node) return 0;
  let count = /^h[1-6]$/.test(node.tag) ? 1 : 0;
  for (const child of node.children) {
    count += countHeadingsInHierarchy(child);
  }
  return count;
}
