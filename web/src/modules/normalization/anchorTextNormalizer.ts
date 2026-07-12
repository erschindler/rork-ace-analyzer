/**
 * Anchor Text Normalizer — Phase 3
 * Normalizes anchor text clarity, link relevance, and link ambiguity.
 * Standardizes clarity classifications and ambiguity flags.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText, normalizeForComparison } from "./textNormalizer";

/** Ambiguous anchor patterns. */
const AMBIGUOUS_PATTERNS = [
  "click here", "read more", "more", "here", "link", "this",
  "this page", "this link", "see more", "view more", "learn more",
  "continue", "go", "next", "prev", "previous",
];

/**
 * Normalize anchor text evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized anchor text sections.
 */
export function normalizeAnchorText(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.anchorText) {
    const normalized = normalizeSection(section, "anchorText", isContaminated);

    let clearCount = 0;
    let ambiguousCount = 0;
    let noTextCount = 0;
    let imageOnlyCount = 0;

    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const text = normalizeParagraphText((sig.metadata?.text as string) ?? sig.value);
      const href = (sig.metadata?.href as string) ?? "";
      const lowerText = text.toLowerCase();

      // Re-classify clarity
      const isAmbiguous = AMBIGUOUS_PATTERNS.some(
        (a) => lowerText === a || lowerText.startsWith(a),
      );
      const hasClearIndicator = /\b[A-Z][a-z]+/.test(text) || /\w{10,}/.test(text);
      const isClear = !isAmbiguous && hasClearIndicator && text.length > 5;
      const hasText = text.length > 0;
      const hasImage = sig.metadata?.hasImage as boolean | undefined;

      if (!hasText) {
        if (hasImage) imageOnlyCount++;
        else noTextCount++;
      } else if (isAmbiguous) {
        ambiguousCount++;
      } else if (isClear) {
        clearCount++;
      }

      // Determine relevance
      const isRelevant = sig.metadata?.isRelevant as boolean | undefined;

      // Classify anchor quality
      const quality = classifyAnchorQuality({
        hasText,
        isClear,
        isAmbiguous,
        isRelevant: isRelevant ?? false,
        hasImage: hasImage ?? false,
      });

      return {
        ...sig,
        value: text || href,
        confidence: isClear ? 0.9 : isAmbiguous ? 0.4 : 0.65,
        metadata: {
          ...sig.metadata,
          text,
          href,
          textLength: text.length,
          isAmbiguous,
          isClear,
          isRelevant: isRelevant ?? false,
          hasText,
          hasImage: hasImage ?? false,
          anchorQuality: quality,
          issue: isAmbiguous
            ? "ambiguous_anchor_text"
            : !hasText
            ? hasImage
              ? "image_only_link"
              : "no_anchor_text"
            : !isRelevant
            ? "potentially_irrelevant"
            : undefined,
        },
      };
    });

    // Add anchor text summary
    const totalAnchors = normalized.normalizedSignals.filter(
      (s) => s.type === "anchor_text" || s.type === "anchor_no_text" || s.type === "anchor_image_only",
    ).length;
    const clarityRatio = totalAnchors > 0 ? clearCount / totalAnchors : 0;

    normalized.normalizedSignals.push({
      type: "anchor_text_summary",
      value: `Clarity: ${(clarityRatio * 100).toFixed(0)}% (${clearCount} clear, ${ambiguousCount} ambiguous, ${noTextCount} no text)`,
      confidence: 0.9,
      selector: "body",
      metadata: {
        totalAnchors,
        clearAnchors: clearCount,
        ambiguousAnchors: ambiguousCount,
        noTextAnchors: noTextCount,
        imageOnlyAnchors: imageOnlyCount,
        clarityRatio: Math.round(clarityRatio * 10000) / 10000,
        hasGoodAnchorText: clarityRatio > 0.7,
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => s.value)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Classify anchor text quality.
 */
function classifyAnchorQuality(params: {
  hasText: boolean;
  isClear: boolean;
  isAmbiguous: boolean;
  isRelevant: boolean;
  hasImage: boolean;
}): "excellent" | "good" | "fair" | "poor" | "critical" {
  if (!params.hasText && !params.hasImage) return "critical";
  if (!params.hasText && params.hasImage) return "poor";
  if (params.isAmbiguous) return "poor";
  if (params.isClear && params.isRelevant) return "excellent";
  if (params.isClear) return "good";
  if (!params.isRelevant) return "fair";
  return "fair";
}
