/**
 * Anchor Text Extractor — Phase 2
 * Detects anchor text clarity, link relevance, and link ambiguity.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Patterns for ambiguous anchor text. */
const AMBIGUOUS_ANCHORS = [
  "click here", "read more", "more", "here", "link", "this",
  "this page", "this link", "see more", "view more", "learn more",
  "continue", "go", "next", "prev", "previous",
];

/** Patterns for clear anchor text. */
const CLEAR_INDICATORS = [
  /\b[A-Z][a-z]+/, // Starts with capital
  /\w{10,}/, // Contains a long word
];

/**
 * Detect anchor text clarity and link relevance from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing anchor text signals.
 */
export function extractAnchorText(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const anchors = doc.querySelectorAll("a[href]");

  let clearCount = 0;
  let ambiguousCount = 0;
  let noTextCount = 0;
  let imageOnlyCount = 0;

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const text = anchor.textContent?.trim() ?? "";
    const lowerText = text.toLowerCase();

    if (!text) {
      // Check if it's an image link
      const hasImage = anchor.querySelector("img") !== null;
      if (hasImage) {
        imageOnlyCount++;
        const alt = anchor.querySelector("img")?.getAttribute("alt") ?? "";
        signals.push({
          type: "anchor_image_only",
          value: truncateText(alt || href, 200),
          confidence: 0.5,
          selector: generateSelector(anchor),
          metadata: {
            href: truncateText(href, 200),
            hasText: false,
            hasImage: true,
            altText: alt,
            issue: "image_only_link",
          },
        });
      } else {
        noTextCount++;
        signals.push({
          type: "anchor_no_text",
          value: truncateText(href, 200),
          confidence: 0.3,
          selector: generateSelector(anchor),
          metadata: {
            href: truncateText(href, 200),
            hasText: false,
            issue: "no_anchor_text",
          },
        });
      }
      return;
    }

    // Classify clarity
    const isAmbiguous = AMBIGUOUS_ANCHORS.some((a) => lowerText === a || lowerText.startsWith(a));
    const hasClearIndicator = CLEAR_INDICATORS.some((p) => p.test(text));
    const isClear = !isAmbiguous && hasClearIndicator && text.length > 5;

    if (isAmbiguous) ambiguousCount++;
    else if (isClear) clearCount++;

    // Determine relevance (does text relate to href?)
    let isRelevant = false;
    try {
      const url = new URL(href, "https://example.com");
      const urlPath = url.pathname.toLowerCase();
      const textWords = lowerText.split(/\s+/);
      isRelevant = textWords.some((word) => word.length > 3 && urlPath.includes(word));
    } catch {
      // Relative URL — check if text appears in href
      isRelevant = textWordsInHref(lowerText, href.toLowerCase());
    }

    signals.push({
      type: "anchor_text",
      value: truncateText(text, 200),
      confidence: isClear ? 0.9 : isAmbiguous ? 0.4 : 0.65,
      selector: generateSelector(anchor),
      metadata: {
        href: truncateText(href, 200),
        text,
        textLength: text.length,
        isAmbiguous,
        isClear,
        isRelevant,
        issue: isAmbiguous ? "ambiguous_anchor_text" : !isRelevant ? "potentially_irrelevant" : undefined,
      },
    });
  });

  const totalAnchors = anchors.length;
  const clarityRatio = totalAnchors > 0 ? clearCount / totalAnchors : 0;

  const section: EvidenceSection = {
    category: "anchorText",
    label: "Anchor Text Analysis",
    signals: signals.slice(0, 300),
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalAnchors,
      clearAnchors: clearCount,
      ambiguousAnchors: ambiguousCount,
      noTextAnchors: noTextCount,
      imageOnlyAnchors: imageOnlyCount,
      clarityRatio,
      hasGoodAnchorText: clarityRatio > 0.7,
    },
  };

  return [section];
}

/**
 * Check if any text words appear in the href string.
 * @internal
 */
function textWordsInHref(text: string, href: string): boolean {
  const words = text.split(/\s+/).filter((w) => w.length > 3);
  return words.some((w) => href.includes(w));
}
