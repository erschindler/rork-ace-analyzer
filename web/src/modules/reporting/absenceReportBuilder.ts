/**
 * Absence Report Builder — Phase 5
 * Converts normalized absence evidence into readable text and maps
 * absence evidence to affected metrics.
 *
 * Does NOT recompute or alter absence evidence — only transforms representation.
 */

import type { ACEScore, NormalizedEvidenceResult, NormalizedSection } from "@/types";
import { METRIC_KEYS } from "@/modules/scoring/scoringTypes";

/**
 * Extract absence evidence strings from scoring diagnostics.
 * Preserves exactly what the scoring engine produced.
 * @param score The ACEScore with diagnostics.
 * @returns Array of absence evidence strings.
 */
export function buildAbsenceEvidenceList(score: ACEScore): string[] {
  return [...score.diagnostics.absenceEvidence];
}

/**
 * Convert normalized absence sections into readable text descriptions.
 * @param normalized The normalized evidence result.
 * @returns Array of human-readable absence descriptions.
 */
export function buildAbsenceDescriptions(normalized: NormalizedEvidenceResult): string[] {
  const descriptions: string[] = [];
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "absence_summary" || sig.type === "contamination") continue;
      const label = (sig.metadata?.label as string) ?? sig.type;
      const severity = (sig.metadata?.severity as string) ?? "info";
      const desc = `[${severity.toUpperCase()}] ${label}: ${sig.value}`;
      descriptions.push(desc);
    }
  }
  return descriptions;
}

/**
 * Map absence evidence to affected metrics.
 * Each absence category can affect specific metrics.
 * @param score The ACEScore with absence evidence in diagnostics.
 * @returns Record mapping absence evidence string → affected metric keys.
 */
export function mapAbsenceToMetrics(
  score: ACEScore,
): Record<string, string[]> {
  const mapping: Record<string, string[]> = {};

  for (const absenceStr of score.diagnostics.absenceEvidence) {
    // Parse the absence evidence string to extract the metric and category
    // Format from scoringDiagnostics: "[metric] Absence: category"
    const match = absenceStr.match(/^\[(\w+)\]\s*(.*)$/);
    if (match) {
      const metric = match[1];
      const rest = match[2];
      if (!mapping[rest]) {
        mapping[rest] = [];
      }
      if (!mapping[rest].includes(metric)) {
        mapping[rest].push(metric);
      }
    } else {
      // Fallback: store the whole string
      if (!mapping[absenceStr]) {
        mapping[absenceStr] = [];
      }
    }
  }

  return mapping;
}

/**
 * Get a summary of absence categories from normalized evidence.
 * @param normalized The normalized evidence result.
 * @returns Array of unique absence category identifiers.
 */
export function getAbsenceCategories(normalized: NormalizedEvidenceResult): string[] {
  const categories = new Set<string>();
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "absence_summary" || sig.type === "contamination") continue;
      const category = (sig.metadata?.category as string) ?? sig.type;
      if (category) categories.add(category);
    }
  }
  return [...categories].sort();
}

/**
 * Count total absence signals from normalized evidence.
 * @param normalized The normalized evidence result.
 * @returns Total count of absence signals (excluding summary/contamination).
 */
export function countAbsenceSignals(normalized: NormalizedEvidenceResult): number {
  let count = 0;
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      if (sig.type !== "absence_summary" && sig.type !== "contamination") {
        count++;
      }
    }
  }
  return count;
}
