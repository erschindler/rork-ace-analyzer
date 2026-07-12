/**
 * Redundancy Extractor — Phase 2
 * Detects repeated headings, paragraphs, blocks, and duplicated content.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { extractVisibleTextFromElement, generateSelector, truncateText } from "./domParser";

/** Minimum text length to consider for redundancy. */
const MIN_TEXT_LENGTH = 30;

/** Minimum repetition count to flag as redundant. */
const MIN_REPEAT_COUNT = 2;

/**
 * Detect redundant content in a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing redundancy signals.
 */
export function extractRedundancy(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const body = doc.body;
  if (!body) return [createEmptySection()];

  // Track text occurrences
  const textOccurrences = new Map<string, { count: number; selectors: string[] }>();

  // Check headings
  const headings = doc.querySelectorAll("h1, h2, h3, h4, h5, h6");
  headings.forEach((heading) => {
    const text = heading.textContent?.trim() ?? "";
    if (text.length >= MIN_TEXT_LENGTH) {
      const key = text.toLowerCase().substring(0, 150);
      const existing = textOccurrences.get(key);
      if (existing) {
        existing.count++;
        existing.selectors.push(generateSelector(heading));
      } else {
        textOccurrences.set(key, { count: 1, selectors: [generateSelector(heading)] });
      }
    }
  });

  // Check paragraphs
  const paragraphs = doc.querySelectorAll("p");
  paragraphs.forEach((p) => {
    const text = p.textContent?.trim() ?? "";
    if (text.length >= MIN_TEXT_LENGTH) {
      const key = text.toLowerCase().substring(0, 150);
      const existing = textOccurrences.get(key);
      if (existing) {
        existing.count++;
        existing.selectors.push(generateSelector(p));
      } else {
        textOccurrences.set(key, { count: 1, selectors: [generateSelector(p)] });
      }
    }
  });

  // Check div blocks
  const divs = doc.querySelectorAll("div");
  divs.forEach((div) => {
    // Only check leaf divs (no child divs)
    if (div.querySelector("div") === null) {
      const text = div.textContent?.trim() ?? "";
      if (text.length >= MIN_TEXT_LENGTH) {
        const key = text.toLowerCase().substring(0, 150);
        const existing = textOccurrences.get(key);
        if (existing) {
          existing.count++;
          existing.selectors.push(generateSelector(div));
        } else {
          textOccurrences.set(key, { count: 1, selectors: [generateSelector(div)] });
        }
      }
    }
  });

  // Generate signals for redundant content
  let redundantCount = 0;
  let maxRepetition = 0;
  const redundantCategories: string[] = [];

  textOccurrences.forEach((data, key) => {
    if (data.count >= MIN_REPEAT_COUNT) {
      redundantCount++;
      maxRepetition = Math.max(maxRepetition, data.count);

      // Determine content type from first selector
      const firstTag = data.selectors[0]?.split(/[\.#\s>]/)[0] ?? "unknown";
      redundantCategories.push(firstTag);

      signals.push({
        type: "redundant_content",
        value: truncateText(key, 200),
        confidence: 0.9,
        selector: data.selectors[0],
        metadata: {
          repetitionCount: data.count,
          selectors: data.selectors.slice(0, 10),
          contentType: firstTag,
          textSnippet: truncateText(key, 200),
        },
      });
    }
  });

  // Check for boilerplate repetition (nav menus, footers duplicated)
  const navElements = doc.querySelectorAll("nav");
  const navTexts = new Set<string>();
  navElements.forEach((nav) => {
    const text = extractVisibleTextFromElement(nav).trim();
    if (text.length > 20) navTexts.add(text.substring(0, 100));
  });
  if (navTexts.size > 0) {
    // Check if nav text appears in other parts of the page
    const fullText = extractVisibleTextFromElement(body);
    navTexts.forEach((navText) => {
      const occurrences = fullText.toLowerCase().split(navText.toLowerCase()).length - 1;
      if (occurrences > 1) {
        signals.push({
          type: "redundant_navigation",
          value: truncateText(navText, 200),
          confidence: 0.75,
          selector: "nav",
          metadata: { repetitionCount: occurrences, contentType: "navigation" },
        });
        redundantCount++;
      }
    });
  }

  const section: EvidenceSection = {
    category: "redundancy",
    label: "Content Redundancy Detection",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 0.85 : 0,
    metadata: {
      redundantCount,
      maxRepetition,
      redundantContentTypes: [...new Set(redundantCategories)],
      hasSignificantRedundancy: redundantCount > 3 || maxRepetition > 3,
    },
  };

  return [section];
}

/** @internal */
function createEmptySection(): EvidenceSection {
  return {
    category: "redundancy",
    label: "Content Redundancy Detection",
    signals: [],
    count: 0,
    confidence: 0,
    metadata: { redundantCount: 0, maxRepetition: 0, hasSignificantRedundancy: false },
  };
}
