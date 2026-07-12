/**
 * Semantic Normalizer — Phase 3
 * Normalizes outputs from Phase-2 semantic extractors:
 * semanticHtml, semanticStructure, semanticHeading, semanticParagraph,
 * semanticList, semanticTable, semanticLink.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection, normalizeHeadingLevels } from "./structureNormalizer";
import { normalizeHeadingText, normalizeParagraphText, normalizeForComparison } from "./textNormalizer";

/**
 * Normalize semantic HTML evidence (header, footer, nav, main, article, etc.).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic HTML sections.
 */
export function normalizeSemanticHtml(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.semantic.map((section) => {
    const normalized = normalizeSection(section, "semantic", isContaminated);

    // Normalize tag-specific values
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => ({
      ...sig,
      value: normalizeParagraphText(sig.value),
      metadata: {
        ...sig.metadata,
        normalizedTag: (sig.metadata?.tag as string) ?? sig.type,
      },
    }));

    return normalized;
  });
}

/**
 * Normalize semantic structure evidence (section → subsection relationships).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic structure sections.
 */
export function normalizeSemanticStructure(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.semanticStructure.map((section) =>
    normalizeSection(section, "semanticStructure", isContaminated),
  );
}

/**
 * Normalize semantic heading evidence (topic, clarity, ambiguity).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic heading sections.
 */
export function normalizeSemanticHeadings(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.headings) {
    const normalized = normalizeSection(section, "semantic_headings", isContaminated);
    // Apply heading-specific normalization
    normalized.normalizedSignals = normalizeHeadingLevels(normalized.normalizedSignals);
    sections.push(normalized);
  }

  return sections;
}

/**
 * Normalize semantic paragraph evidence (topic, clarity, terminology).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic paragraph sections.
 */
export function normalizeSemanticParagraphs(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.paragraphs.map((section) => {
    const normalized = normalizeSection(section, "semantic_paragraphs", isContaminated);

    // Normalize paragraph values with sentence-level cleanup
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => ({
      ...sig,
      value: normalizeParagraphText(sig.value),
    }));

    return normalized;
  });
}

/**
 * Normalize semantic list evidence (steps, features, definitions, attributes).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic list sections.
 */
export function normalizeSemanticLists(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.lists.map((section) => {
    const normalized = normalizeSection(section, "semantic_lists", isContaminated);

    // Normalize list items: standardize the pipe-delimited format
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const items = (sig.metadata?.items as string[]) ?? [];
      const normalizedItems = items.map((item) => normalizeParagraphText(item));

      return {
        ...sig,
        value: normalizedItems.filter((i) => i.length > 0).join(" | "),
        metadata: {
          ...sig.metadata,
          items: normalizedItems,
        },
      };
    });

    return normalized;
  });
}

/**
 * Normalize semantic table evidence (pricing, comparison, specs, key-value).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic table sections.
 */
export function normalizeSemanticTables(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.tables.map((section) => {
    const normalized = normalizeSection(section, "semantic_tables", isContaminated);

    // Normalize table headers and sample rows
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const headers = (sig.metadata?.headers as string[]) ?? [];
      const normalizedHeaders = headers.map((h) => normalizeHeadingText(h));

      const sampleRows = (sig.metadata?.sampleRows as string[][]) ?? [];
      const normalizedRows = sampleRows.map((row) =>
        row.map((cell) => normalizeParagraphText(cell)),
      );

      return {
        ...sig,
        value: normalizedHeaders.filter((h) => h.length > 0).join(" | "),
        metadata: {
          ...sig.metadata,
          headers: normalizedHeaders,
          sampleRows: normalizedRows,
        },
      };
    });

    return normalized;
  });
}

/**
 * Normalize semantic link evidence (navigational, informational, promotional).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized semantic link sections.
 */
export function normalizeSemanticLinks(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return evidence.links.map((section) => {
    const normalized = normalizeSection(section, "semantic_links", isContaminated);

    // Normalize link text and classify
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const text = normalizeParagraphText(sig.value);
      const href = (sig.metadata?.href as string) ?? "";
      const linkType = classifyLinkType(text, href);

      return {
        ...sig,
        value: text,
        metadata: {
          ...sig.metadata,
          href: href,
          linkType,
          normalizedText: text,
        },
      };
    });

    return normalized;
  });
}

/**
 * Classify a link's semantic type based on text and href.
 * @param text Link text.
 * @param href Link URL.
 * @returns Link type classification.
 */
function classifyLinkType(text: string, href: string): string {
  const lowerText = text.toLowerCase();
  const lowerHref = href.toLowerCase();

  const navPatterns = ["/home", "/about", "/contact", "/menu", "navigation", "navbar", "footer"];
  const promoPatterns = ["buy", "purchase", "subscribe", "sign up", "register", "download", "get started", "try", "free trial", "upgrade"];
  const infoPatterns = ["/docs", "/guide", "/tutorial", "/help", "/faq", "/blog", "/article", "learn more"];

  if (navPatterns.some((p) => lowerHref.includes(p) || lowerText.includes(p))) {
    return "navigational";
  }
  if (promoPatterns.some((p) => lowerText.includes(p) || lowerHref.includes(p))) {
    return "promotional";
  }
  if (infoPatterns.some((p) => lowerHref.includes(p) || lowerText.includes(p))) {
    return "informational";
  }

  return "contextual";
}

/**
 * Normalize all semantic sections from the evidence result.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Object containing all normalized semantic section arrays.
 */
export function normalizeAllSemantic(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): {
  semantic: NormalizedSection[];
  semanticStructure: NormalizedSection[];
} {
  return {
    semantic: normalizeSemanticHtml(evidence, isContaminated),
    semanticStructure: normalizeSemanticStructure(evidence, isContaminated),
  };
}
