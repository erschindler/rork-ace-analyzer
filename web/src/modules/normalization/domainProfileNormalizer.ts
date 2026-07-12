/**
 * Domain Profile Normalizer — Phase 3
 * Normalizes domain signals: ecommerce, blog, documentation, product page,
 * landing page, support page. Standardizes type labels and confidence scores.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeForComparison } from "./textNormalizer";

/** Canonical domain type mapping. */
const DOMAIN_TYPE_MAP: Record<string, string> = {
  ecommerce: "ecommerce",
  blog: "blog",
  documentation: "documentation",
  documentation_alt: "documentation",
  product_page: "product_page",
  landing_page: "landing_page",
  support_page: "support_page",
};

/** Domain type priority order (for primary type determination). */
const DOMAIN_PRIORITY = [
  "ecommerce",
  "product_page",
  "documentation",
  "blog",
  "landing_page",
  "support_page",
];

/**
 * Normalize domain profile evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized domain profile sections.
 */
export function normalizeDomainProfile(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.domainProfile) {
    const normalized = normalizeSection(section, "domainProfile", isContaminated);

    // Normalize domain type labels and scores
    const normalizedSignals: NormalizedSignal[] = [];
    const typeScores: Record<string, number> = {};

    for (const sig of normalized.normalizedSignals) {
      const rawType = (sig.metadata?.domainType as string) ?? "unknown";
      const canonicalType = DOMAIN_TYPE_MAP[rawType] ?? rawType;
      const score = (sig.metadata?.score as number) ?? 0;
      const isPrimary = sig.metadata?.isPrimary as boolean | undefined;

      // Aggregate scores for canonical types
      typeScores[canonicalType] = (typeScores[canonicalType] ?? 0) + score;

      normalizedSignals.push({
        ...sig,
        value: `${canonicalType}: score ${typeScores[canonicalType]}`,
        confidence: Math.min(typeScores[canonicalType] / 10, 1.0),
        metadata: {
          ...sig.metadata,
          domainType: canonicalType,
          originalType: rawType,
          score: typeScores[canonicalType],
          isPrimary,
        },
      });
    }

    // Re-determine primary type based on canonical scores and priority
    const sortedTypes = Object.entries(typeScores).sort((a, b) => {
      // Higher score first, then by priority
      if (b[1] !== a[1]) return b[1] - a[1];
      const aPriority = DOMAIN_PRIORITY.indexOf(a[0]);
      const bPriority = DOMAIN_PRIORITY.indexOf(b[0]);
      return aPriority - bPriority;
    });

    const primaryType = sortedTypes[0]?.[0] ?? "unknown";

    // Mark primary type
    for (const sig of normalizedSignals) {
      const sigType = sig.metadata?.domainType as string;
      sig.metadata = {
        ...sig.metadata,
        isPrimary: sigType === primaryType,
      };
    }

    normalized.normalizedSignals = normalizedSignals;
    normalized.normalizedContent = normalizedSignals
      .map((s) => s.value)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Get the normalized primary domain type from normalized sections.
 * @param sections Normalized domain profile sections.
 * @returns Primary domain type or "unknown".
 */
export function getPrimaryDomainType(sections: NormalizedSection[]): string {
  for (const section of sections) {
    for (const sig of section.normalizedSignals) {
      if (sig.metadata?.isPrimary === true) {
        return (sig.metadata?.domainType as string) ?? "unknown";
      }
    }
  }
  return "unknown";
}
