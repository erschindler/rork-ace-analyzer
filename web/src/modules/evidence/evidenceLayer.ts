/**
 * Evidence Aggregator — Production Version (ACE v1.2)
 *
 * Orchestrates all extraction modules in deterministic order.
 * Handles contamination, DOM corruption, rendered DOM diagnostics,
 * lazy-load detection, Elementor detection, and structural consistency.
 */

import {
  parseHtmlToDom,
  extractVisibleText,
  extractMainContent,
  detectHydrationShell,
  detectScriptOnlyDom,
  detectBoilerplateDom,
  detectShadowDom,
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

/**
 * Main evidence extraction function.
 */
export function extractEvidenceFromHtmlString(html, url, renderedDomResult = null) {
  const timestamp = Date.now();
  const contaminationCollector = createContaminationDiagnostics();

  // 1. Parse HTML (raw or rendered)
  const htmlToParse = renderedDomResult?.rendered ? renderedDomResult.html : html;
  const { doc, parseErrors, domCorruption, domCorruptionReason } = parseHtmlToDom(htmlToParse);

  if (parseErrors.length > 0) {
    contaminationCollector.recordParserErrors(parseErrors);
  }
  if (domCorruption) {
    contaminationCollector.recordDomCorruption(domCorruptionReason);
  }

  // 2. Contamination detection
  const contaminationResult = detectContamination(doc, htmlToParse, contaminationCollector);

  // 3. Basic diagnostics
  const visibleText = extractVisibleText(doc);
  const mainContent = extractMainContent(doc);
  const mainText = mainContent ? extractVisibleTextFromElement(mainContent) : "";

  const diagnostics = {
    htmlSize: htmlToParse.length,
    parseErrors: parseErrors.length > 0 ? parseErrors : undefined,

    // Rendered DOM diagnostics
    renderedDomUsed: renderedDomResult?.rendered || false,
    renderedDomScrollSteps: renderedDomResult?.scrollSteps ?? 0,
    renderedDomContentGrowth: renderedDomResult?.contentGrowth ?? 0,
    renderedDomLazyLoadTriggered: renderedDomResult?.lazyLoadTriggered ?? false,
    renderedDomElementorDetected: renderedDomResult?.elementorDetected ?? false,
    renderedDomContaminationFlags: renderedDomResult?.contaminationFlags ?? [],

    // DOM contamination diagnostics
    hydrationShell: detectHydrationShell(doc),
    shadowDom: detectShadowDom(doc),
    scriptOnlyDom: detectScriptOnlyDom(doc),
    boilerplateOnly: detectBoilerplateDom(doc),

    // Lazy-load / Elementor detection
    lazyLoadDetected: hasLazyLoadPatterns(htmlToParse),
    elementorDetected: hasElementorPatterns(htmlToParse),

    // Structural diagnostics
    visibleTextLength: visibleText.length,
    mainContentFound: mainText.length > 80,
    domCorruption,
    domCorruptionReason,

    // Truncation detection
    truncatedHtml:
      htmlToParse.length > 100 &&
      (!htmlToParse.includes("</html>") || !htmlToParse.includes("</body>")),
  };

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

  // 8. Build final result
  const result = {
    url,
    timestamp,

    metadata: metadata || { contentLength: 0 },
    headings: headings || [],
    paragraphs: paragraphs || [],
    lists: lists || [],
    tables: tables || [],
    links: links || [],
    accessibility: accessibility || [],
    structuredData: structuredData || [],
    semantic: semanticHtml || [],
    semanticStructure: semanticStructure || [],
    structuredContent: structuredContent || [],
    extractability: extractability || [],
    redundancy: redundancy || [],
    domainProfile: domainProfile || [],
    entities: entities || [],
    anchorText: anchorText || [],
    hierarchy: hierarchy || null,
    absence: absence || [],

    contamination: contaminationResult.isContaminated,
    contaminationType: contaminationResult.type,
    contaminationFlags: contaminationResult.flags,

    diagnostics,
    rawVisibleText: visibleText,
  };

  return result;
}

/** Safe wrapper to prevent one extractor from crashing the entire layer */
function safeExtract(fn) {
  try {
    return fn();
  } catch (err) {
    console.error("Extractor failed:", err);
    return null;
  }
}

/** Extract visible text from a single element */
function extractVisibleTextFromElement(el) {
  if (!el) return "";
  const clone = el.cloneNode(true);
  clone.querySelectorAll("script, style, template").forEach((e) => e.remove());
  return (clone.textContent || "").replace(/\s+/g, " ").trim();
}

export { extractEvidenceFromHtmlString };
