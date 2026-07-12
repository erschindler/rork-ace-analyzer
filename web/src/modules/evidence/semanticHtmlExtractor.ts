/**
 * Semantic HTML Extractor — Phase 2
 * Extracts semantic HTML5 elements: header, footer, nav, main, article,
 * section, aside, figure, figcaption, time, address.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Semantic HTML5 elements to extract. */
const SEMANTIC_TAGS = [
  "header", "footer", "nav", "main", "article",
  "section", "aside", "figure", "figcaption",
  "time", "address", "details", "summary", "mark",
];

/**
 * Extract semantic HTML5 elements from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic element signals.
 */
export function extractSemanticHtml(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const tagCounts: Record<string, number> = {};

  for (const tag of SEMANTIC_TAGS) {
    const elements = doc.querySelectorAll(tag);
    tagCounts[tag] = elements.length;

    elements.forEach((el) => {
      const text = el.textContent?.trim() ?? "";
      signals.push({
        type: tag,
        value: truncateText(text, 300),
        confidence: 0.9,
        selector: generateSelector(el),
        metadata: {
          tag,
          textLength: text.length,
          hasId: el.hasAttribute("id"),
          hasClass: el.hasAttribute("class"),
          attrs: {
            id: el.getAttribute("id") ?? undefined,
            class: el.getAttribute("class") ?? undefined,
            role: el.getAttribute("role") ?? undefined,
            datetime: tag === "time" ? el.getAttribute("datetime") ?? undefined : undefined,
          },
        },
      });
    });
  }

  const section: EvidenceSection = {
    category: "semantic",
    label: "Semantic HTML Elements",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 0.9 : 0,
    metadata: {
      tagCounts,
      hasMain: tagCounts.main > 0,
      hasArticle: tagCounts.article > 0,
      hasNav: tagCounts.nav > 0,
      hasHeader: tagCounts.header > 0,
      hasFooter: tagCounts.footer > 0,
      hasAside: tagCounts.aside > 0,
      hasFigure: tagCounts.figure > 0,
      hasTime: tagCounts.time > 0,
      semanticRichness: signals.length,
    },
  };

  return [section];
}
