/**
 * Heading Extractor — Phase 2
 * Extracts all heading elements (h1–h6) with hierarchy context.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract heading evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing heading signals.
 */
export function extractHeadings(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const headingLevels: Record<number, number> = {};

  const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((heading) => {
    const tag = heading.tagName.toLowerCase();
    const level = parseInt(tag.charAt(1), 10);
    const text = heading.textContent?.trim() ?? "";

    headingLevels[level] = (headingLevels[level] ?? 0) + 1;

    if (text) {
      signals.push({
        type: tag,
        value: truncateText(text, 300),
        confidence: 0.95,
        selector: generateSelector(heading),
        metadata: {
          level,
          textLength: text.length,
          hasId: heading.hasAttribute("id"),
          id: heading.getAttribute("id") ?? undefined,
        },
      });
    }
  });

  const section: EvidenceSection = {
    category: "headings",
    label: "Document Headings",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 0.95 : 0,
    metadata: {
      totalHeadings: signals.length,
      byLevel: headingLevels,
      hasH1: (headingLevels[1] ?? 0) > 0,
      multipleH1: (headingLevels[1] ?? 0) > 1,
    },
  };

  return [section];
}
