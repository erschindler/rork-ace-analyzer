/**
 * Semantic Heading Extractor — Phase 2
 * Analyzes semantic meaning of headings: topic, clarity, ambiguity, hierarchy.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Words that indicate ambiguous headings. */
const AMBIGUOUS_WORDS = ["click here", "read more", "more info", "details", "home", "welcome", "untitled", "lorem ipsum"];

/** Minimum heading length for clarity. */
const MIN_HEADING_LENGTH = 5;

/**
 * Extract semantic meaning of headings from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic heading signals.
 */
export function extractSemanticHeadings(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  let clearCount = 0;
  let ambiguousCount = 0;
  const topics: string[] = [];

  headings.forEach((heading) => {
    const tag = heading.tagName.toLowerCase();
    const level = parseInt(tag.charAt(1), 10);
    const text = heading.textContent?.trim() ?? "";
    if (!text) return;

    const lowerText = text.toLowerCase();
    const isAmbiguous = AMBIGUOUS_WORDS.some((w) => lowerText.includes(w)) || text.length < MIN_HEADING_LENGTH;
    const isClear = !isAmbiguous && text.length > MIN_HEADING_LENGTH;

    if (isAmbiguous) ambiguousCount++;
    if (isClear) {
      clearCount++;
      // Extract topic keywords (first 5 significant words)
      const words = text.split(/\s+/).filter((w) => w.length > 3).slice(0, 5);
      topics.push(words.join(" "));
    }

    signals.push({
      type: `semantic_${tag}`,
      value: truncateText(text, 300),
      confidence: isClear ? 0.9 : 0.5,
      selector: generateSelector(heading),
      metadata: {
        level,
        text,
        textLength: text.length,
        wordCount: text.split(/\s+/).length,
        isAmbiguous,
        isClear,
        topic: isClear ? text.split(/\s+/).slice(0, 5).join(" ") : undefined,
        hierarchyCorrect: checkHierarchyCorrectness(heading, level),
      },
    });
  });

  const section: EvidenceSection = {
    category: "semantic_headings",
    label: "Semantic Heading Analysis",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalHeadings: signals.length,
      clearHeadings: clearCount,
      ambiguousHeadings: ambiguousCount,
      clarityRatio: signals.length > 0 ? clearCount / signals.length : 0,
      detectedTopics: topics.slice(0, 20),
      hasTopicConsistency: topics.length > 0,
    },
  };

  return [section];
}

/**
 * Check if a heading's hierarchy level is correct (no skipped levels).
 * @internal
 */
function checkHierarchyCorrectness(heading: Element, level: number): boolean {
  let current: Element | null = heading.parentElement;
  let foundLevel = 0;

  while (current && current.tagName !== "HTML") {
    const childHeadings = current.querySelectorAll(":scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6");
    if (childHeadings.length > 0) {
      // Check if there's a parent heading with a lower level
      for (const ch of childHeadings) {
        const chLevel = parseInt(ch.tagName.charAt(1), 10);
        if (chLevel < level && chLevel > foundLevel) {
          foundLevel = chLevel;
        }
      }
    }
    current = current.parentElement;
  }

  // If level > 2, there should be a parent heading at level-1 or lower
  if (level > 2 && foundLevel === 0) return false;
  // Should not skip more than one level
  if (foundLevel > 0 && level > foundLevel + 1) return false;
  return true;
}
