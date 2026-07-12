/**
 * Paragraph Extractor — Phase 2
 * Extracts paragraph (<p>) elements with content metrics.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Minimum paragraph text length to be considered substantive content. */
const MIN_PARAGRAPH_LENGTH = 20;

/**
 * Extract paragraph evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing paragraph signals.
 */
export function extractParagraphs(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let totalChars = 0;
  let substantiveCount = 0;

  const paragraphs = doc.querySelectorAll("p");
  paragraphs.forEach((p) => {
    const text = p.textContent?.trim() ?? "";
    if (!text) return;

    totalChars += text.length;
    const isSubstantive = text.length >= MIN_PARAGRAPH_LENGTH;
    if (isSubstantive) substantiveCount++;

    signals.push({
      type: "p",
      value: truncateText(text, 500),
      confidence: isSubstantive ? 0.9 : 0.6,
      selector: generateSelector(p),
      metadata: {
        textLength: text.length,
        isSubstantive,
        wordCount: text.split(/\s+/).length,
      },
    });
  });

  const avgLength = signals.length > 0 ? totalChars / signals.length : 0;

  const section: EvidenceSection = {
    category: "paragraphs",
    label: "Paragraph Content",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalParagraphs: signals.length,
      substantiveParagraphs: substantiveCount,
      totalCharacters: totalChars,
      avgParagraphLength: Math.round(avgLength),
    },
  };

  return [section];
}
