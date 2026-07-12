/**
 * Entity Normalizer — Phase 3
 * Normalizes entity types, labels, and identifiers.
 * Standardizes entity classifications and deduplicates entity values.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText, normalizeForComparison } from "./textNormalizer";

/** Entity type canonicalization map. */
const ENTITY_TYPE_MAP: Record<string, string> = {
  entity_organization: "organization",
  entity_date: "date",
  entity_quantity: "quantity",
  entity_money: "money",
  entity_product: "product",
  entity_location: "location",
  entity_person: "person",
  entity_phone: "phone",
  entity_email: "email",
  entity_address: "address",
  entity_social: "social",
  entity_url: "url",
};

/**
 * Normalize entity evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized entity sections.
 */
export function normalizeEntities(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.entities) {
    const normalized = normalizeSection(section, "entities", isContaminated);

    const entityCounts: Record<string, number> = {};
    const entityLabels: Record<string, string[]> = {};

    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const rawType = sig.type;
      const canonicalType = ENTITY_TYPE_MAP[rawType] ?? rawType;
      const label = normalizeParagraphText(sig.value);
      const comparisonKey = normalizeForComparison(label);

      // Track counts and labels by type
      entityCounts[canonicalType] = (entityCounts[canonicalType] ?? 0) + 1;
      if (!entityLabels[canonicalType]) entityLabels[canonicalType] = [];
      if (!entityLabels[canonicalType].includes(label)) {
        entityLabels[canonicalType].push(label);
      }

      return {
        ...sig,
        value: label,
        confidence: sig.confidence,
        metadata: {
          ...sig.metadata,
          entityType: canonicalType,
          originalType: rawType,
          label,
          comparisonKey,
          category: "entity",
        },
      };
    });

    // Deduplicate entities by type + comparison key
    const seen = new Set<string>();
    const dedupedSignals: NormalizedSignal[] = [];
    let duplicatesRemoved = 0;

    for (const sig of normalized.normalizedSignals) {
      const key = `${sig.metadata?.entityType}:${sig.metadata?.comparisonKey}`;
      if (seen.has(key)) {
        duplicatesRemoved++;
        continue;
      }
      seen.add(key);
      dedupedSignals.push(sig);
    }

    normalized.normalizedSignals = dedupedSignals;
    normalized.duplicatesRemoved = (normalized.duplicatesRemoved ?? 0) + duplicatesRemoved;

    // Add entity summary signal
    const totalEntities = dedupedSignals.length;
    const entityDiversity = Object.keys(entityCounts).length;

    normalized.normalizedSignals.push({
      type: "entity_summary",
      value: `${totalEntities} unique entities across ${entityDiversity} types`,
      confidence: 0.9,
      selector: "body",
      metadata: {
        totalEntities,
        entityDiversity,
        entityCounts,
        entityLabels,
        hasEntities: totalEntities > 0,
        contaminationImpact: isContaminated,
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => `[${s.metadata?.entityType ?? "summary"}] ${s.value}`)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Get normalized entity counts by type from normalized sections.
 * @param sections Normalized entity sections.
 * @returns Record of entity type → count.
 */
export function getEntityCounts(sections: NormalizedSection[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const section of sections) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "entity_summary") {
        const sigCounts = sig.metadata?.entityCounts as Record<string, number>;
        if (sigCounts) {
          for (const [type, count] of Object.entries(sigCounts)) {
            counts[type] = (counts[type] ?? 0) + count;
          }
        }
      }
    }
  }
  return counts;
}
