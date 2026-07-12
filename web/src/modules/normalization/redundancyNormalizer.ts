/**
 * Redundancy Normalizer — Phase 3
 * Normalizes repeated headings, paragraphs, blocks, and duplicated content.
 * Standardizes redundancy signals and calculates deduplication metrics.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeForComparison } from "./textNormalizer";

/**
 * Normalize redundancy evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized redundancy sections.
 */
export function normalizeRedundancy(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.redundancy) {
    const normalized = normalizeSection(section, "redundancy", isContaminated);

    // Normalize redundancy signals
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const repetitionCount = (sig.metadata?.repetitionCount as number) ?? 0;
      const contentType = (sig.metadata?.contentType as string) ?? "unknown";
      const snippet = normalizeForComparison((sig.metadata?.textSnippet as string) ?? sig.value);

      return {
        ...sig,
        value: `[${contentType}] x${repetitionCount}: ${snippet.substring(0, 120)}`,
        confidence: Math.min(0.9, 0.5 + repetitionCount * 0.1),
        metadata: {
          ...sig.metadata,
          repetitionCount,
          contentType: normalizeContentType(contentType),
          textSnippet: snippet,
          severity: getRedundancySeverity(repetitionCount),
          metric: sig.type,
        },
      };
    });

    // Calculate aggregate redundancy metrics
    const signals = normalized.normalizedSignals;
    const totalRedundant = signals.filter((s) => s.type === "redundant_content").length;
    const maxRepetition = Math.max(
      0,
      ...signals.map((s) => (s.metadata?.repetitionCount as number) ?? 0),
    );
    const contentTypes = [...new Set(
      signals.map((s) => s.metadata?.contentType as string).filter(Boolean),
    )];

    // Add redundancy summary signal
    normalized.normalizedSignals.push({
      type: "redundancy_summary",
      value: `${totalRedundant} redundant items, max repetition ${maxRepetition}`,
      confidence: 0.9,
      selector: "body",
      metadata: {
        totalRedundant,
        maxRepetition,
        redundantContentTypes: contentTypes,
        hasSignificantRedundancy: totalRedundant > 3 || maxRepetition > 3,
        severity: getRedundancySeverity(maxRepetition),
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
 * Normalize content type labels.
 */
function normalizeContentType(type: string): string {
  const typeMap: Record<string, string> = {
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
    p: "paragraph",
    div: "block",
    nav: "navigation",
  };
  return typeMap[type] ?? type;
}

/**
 * Get severity level for redundancy based on repetition count.
 */
function getRedundancySeverity(repetitionCount: number): "info" | "warning" | "critical" {
  if (repetitionCount >= 5) return "critical";
  if (repetitionCount >= 3) return "warning";
  return "info";
}
