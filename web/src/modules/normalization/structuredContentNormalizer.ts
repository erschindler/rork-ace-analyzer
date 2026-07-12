/**
 * Structured Content Normalizer — Phase 3
 * Normalizes FAQ blocks, pricing tables, product specs, feature lists,
 * comparison tables, review blocks, and Q&A blocks.
 */

import type { AceEvidenceResult, NormalizedSection } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText, normalizeHeadingText } from "./textNormalizer";

/**
 * Normalize structured content blocks (FAQ, pricing, specs, features, reviews, Q&A).
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized structured content sections.
 */
export function normalizeStructuredContent(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.structuredContent) {
    const normalized = normalizeSection(section, "structuredContent", isContaminated);

    // Normalize block-type-specific content
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const blockType = (sig.metadata?.blockType as string) ?? "unknown";

      switch (blockType) {
        case "faq":
          return normalizeFaqBlock(sig);
        case "pricing":
          return normalizePricingBlock(sig);
        case "specifications":
          return normalizeSpecsBlock(sig);
        case "features":
          return normalizeFeaturesBlock(sig);
        case "review":
          return normalizeReviewBlock(sig);
        case "qa":
          return normalizeQaBlock(sig);
        case "comparison":
          return normalizeComparisonBlock(sig);
        default:
          return sig;
      }
    });

    sections.push(normalized);
  }

  return sections;
}

/**
 * Normalize a FAQ block — standardize question/answer format.
 */
function normalizeFaqBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const question = normalizeParagraphText((sig.metadata?.question as string) ?? sig.value);
  const answer = normalizeParagraphText((sig.metadata?.answer as string) ?? "");

  return {
    ...sig,
    value: `Q: ${question}`,
    metadata: {
      ...sig.metadata,
      blockType: "faq",
      question,
      answer,
      normalizedFormat: "question_answer",
    },
  };
}

/**
 * Normalize a pricing block — standardize plan name and price format.
 */
function normalizePricingBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const planName = normalizeHeadingText((sig.metadata?.planName as string) ?? "");
  const detectedPrice = (sig.metadata?.detectedPrice as string) ?? "";
  const content = normalizeParagraphText(sig.value);

  return {
    ...sig,
    value: [planName, detectedPrice, content].filter((s) => s.length > 0).join(" — "),
    metadata: {
      ...sig.metadata,
      blockType: "pricing",
      planName,
      detectedPrice,
      normalizedFormat: "plan_price",
    },
  };
}

/**
 * Normalize a specifications block — standardize spec key-value format.
 */
function normalizeSpecsBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const specs = (sig.metadata?.specs as string[]) ?? [];
  const normalizedSpecs = specs.map((s) => normalizeParagraphText(s));

  return {
    ...sig,
    value: normalizedSpecs.join(" | "),
    metadata: {
      ...sig.metadata,
      blockType: "specifications",
      specs: normalizedSpecs,
      specCount: normalizedSpecs.length,
      normalizedFormat: "key_value_list",
    },
  };
}

/**
 * Normalize a features block — standardize feature list format.
 */
function normalizeFeaturesBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const features = (sig.metadata?.features as string[]) ?? [];
  const normalizedFeatures = features.map((f) => normalizeParagraphText(f));

  return {
    ...sig,
    value: normalizedFeatures.join(" | "),
    metadata: {
      ...sig.metadata,
      blockType: "features",
      features: normalizedFeatures,
      featureCount: normalizedFeatures.length,
      normalizedFormat: "feature_list",
    },
  };
}

/**
 * Normalize a review block — standardize rating and author format.
 */
function normalizeReviewBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const rating = normalizeParagraphText((sig.metadata?.detectedRating as string) ?? "");
  const author = normalizeParagraphText((sig.metadata?.author as string) ?? "");
  const content = normalizeParagraphText(sig.value);

  return {
    ...sig,
    value: [author, rating, content].filter((s) => s.length > 0).join(" — "),
    metadata: {
      ...sig.metadata,
      blockType: "review",
      detectedRating: rating,
      author,
      normalizedFormat: "author_rating_content",
    },
  };
}

/**
 * Normalize a Q&A block — standardize question/answer format.
 */
function normalizeQaBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const content = normalizeParagraphText(sig.value);

  return {
    ...sig,
    value: content,
    metadata: {
      ...sig.metadata,
      blockType: "qa",
      normalizedFormat: "discussion_text",
    },
  };
}

/**
 * Normalize a comparison block — standardize column headers format.
 */
function normalizeComparisonBlock(sig: import("@/types").NormalizedSignal): import("@/types").NormalizedSignal {
  const headers = (sig.metadata?.headers as string[]) ?? [];
  const normalizedHeaders = headers.map((h) => normalizeHeadingText(h));

  return {
    ...sig,
    value: normalizedHeaders.join(" vs "),
    metadata: {
      ...sig.metadata,
      blockType: "comparison",
      headers: normalizedHeaders,
      columnCount: normalizedHeaders.length,
      normalizedFormat: "comparison_columns",
    },
  };
}
