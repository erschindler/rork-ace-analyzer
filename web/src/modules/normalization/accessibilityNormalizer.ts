/**
 * Accessibility Normalizer — Phase 3
 * Normalizes alt text, ARIA attributes, roles, and landmarks.
 * Standardizes accessibility signal classifications.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText } from "./textNormalizer";

/** Canonical landmark role mapping. */
const LANDMARK_MAP: Record<string, string> = {
  banner: "banner",
  navigation: "navigation",
  main: "main",
  contentinfo: "contentinfo",
  complementary: "complementary",
  search: "search",
  form: "form",
  region: "region",
};

/** Semantic HTML5 element to landmark role mapping. */
const SEMANTIC_TO_LANDMARK: Record<string, string> = {
  header: "banner",
  nav: "navigation",
  main: "main",
  footer: "contentinfo",
  aside: "complementary",
  section: "region",
  article: "article",
  form: "form",
  search: "search",
};

/**
 * Normalize accessibility evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized accessibility sections.
 */
export function normalizeAccessibility(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.accessibility) {
    const normalized = normalizeSection(section, "accessibility", isContaminated);

    let imagesWithoutAlt = 0;
    let imagesWithAlt = 0;
    let landmarkCount = 0;
    let ariaLabelCount = 0;
    let issuesCount = 0;

    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      switch (sig.type) {
        case "img_missing_alt":
          imagesWithoutAlt++;
          issuesCount++;
          return normalizeMissingAlt(sig);

        case "img_alt":
          imagesWithAlt++;
          return normalizeAltText(sig);

        case "aria_landmark":
          landmarkCount++;
          return normalizeLandmark(sig);

        case "semantic_landmark":
          landmarkCount++;
          return normalizeSemanticLandmark(sig);

        case "aria_label":
          ariaLabelCount++;
          return normalizeAriaLabel(sig);

        case "skip_link":
          return normalizeSkipLink(sig);

        case "inputs_without_label":
          issuesCount++;
          return normalizeInputWithoutLabel(sig);

        default:
          return sig;
      }
    });

    // Add accessibility summary signal
    const totalImages = imagesWithAlt + imagesWithoutAlt;
    const altCoverage = totalImages > 0 ? imagesWithAlt / totalImages : 1;

    normalized.normalizedSignals.push({
      type: "accessibility_summary",
      value: `Alt coverage: ${(altCoverage * 100).toFixed(0)}%, Landmarks: ${landmarkCount}, Issues: ${issuesCount}`,
      confidence: 0.9,
      selector: "body",
      metadata: {
        totalImages,
        imagesWithAlt,
        imagesWithoutAlt,
        altCoverage: Math.round(altCoverage * 10000) / 10000,
        landmarkCount,
        ariaLabelCount,
        issuesCount,
        hasGoodAccessibility: altCoverage > 0.8 && issuesCount < 3,
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => `${s.type}: ${s.value}`)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Normalize missing alt text signal.
 */
function normalizeMissingAlt(sig: NormalizedSignal): NormalizedSignal {
  const src = (sig.metadata?.src as string) ?? "";
  return {
    ...sig,
    value: `Missing alt: ${src.substring(0, 100)}`,
    confidence: 0.9,
    metadata: {
      ...sig.metadata,
      issue: "missing_alt",
      severity: "warning",
      category: "image_accessibility",
    },
  };
}

/**
 * Normalize alt text signal.
 */
function normalizeAltText(sig: NormalizedSignal): NormalizedSignal {
  const alt = normalizeParagraphText((sig.metadata?.alt as string) ?? sig.value);
  const isEmpty = alt.length === 0;
  const isDescriptive = alt.length > 10 && !isEmpty;

  return {
    ...sig,
    value: alt,
    confidence: isDescriptive ? 0.85 : 0.5,
    metadata: {
      ...sig.metadata,
      alt,
      isEmpty,
      isDescriptive,
      category: "image_accessibility",
    },
  };
}

/**
 * Normalize ARIA landmark signal.
 */
function normalizeLandmark(sig: NormalizedSignal): NormalizedSignal {
  const rawRole = sig.value.toLowerCase();
  const canonicalRole = LANDMARK_MAP[rawRole] ?? rawRole;

  return {
    ...sig,
    value: canonicalRole,
    confidence: 0.9,
    metadata: {
      ...sig.metadata,
      role: canonicalRole,
      canonicalRole,
      category: "landmark",
    },
  };
}

/**
 * Normalize semantic HTML5 landmark signal.
 */
function normalizeSemanticLandmark(sig: NormalizedSignal): NormalizedSignal {
  const tag = (sig.metadata?.tag as string) ?? sig.value;
  const impliedRole = SEMANTIC_TO_LANDMARK[tag] ?? tag;

  return {
    ...sig,
    value: `${tag} (${impliedRole})`,
    confidence: 0.85,
    metadata: {
      ...sig.metadata,
      tag,
      impliedRole,
      category: "landmark",
    },
  };
}

/**
 * Normalize ARIA label signal.
 */
function normalizeAriaLabel(sig: NormalizedSignal): NormalizedSignal {
  const label = normalizeParagraphText((sig.metadata?.ariaLabel as string) ?? sig.value);

  return {
    ...sig,
    value: label,
    confidence: 0.8,
    metadata: {
      ...sig.metadata,
      ariaLabel: label,
      category: "aria_label",
    },
  };
}

/**
 * Normalize skip link signal.
 */
function normalizeSkipLink(sig: NormalizedSignal): NormalizedSignal {
  const text = normalizeParagraphText(sig.value);

  return {
    ...sig,
    value: text,
    confidence: 0.9,
    metadata: {
      ...sig.metadata,
      category: "skip_link",
      hasSkipLink: true,
    },
  };
}

/**
 * Normalize inputs without label signal.
 */
function normalizeInputWithoutLabel(sig: NormalizedSignal): NormalizedSignal {
  const count = (sig.metadata?.count as number) ?? 0;

  return {
    ...sig,
    value: `${count} inputs without labels`,
    confidence: 0.9,
    metadata: {
      ...sig.metadata,
      count,
      issue: "missing_form_label",
      severity: "warning",
      category: "form_accessibility",
    },
  };
}
