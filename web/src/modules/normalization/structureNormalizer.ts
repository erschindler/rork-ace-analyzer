/**
 * Structure Normalizer — Phase 3
 * Normalizes heading levels, section labels, list/table representations,
 * flattens nested structures, normalizes section ordering and IDs,
 * and normalizes cross-references.
 */

import type { EvidenceSection, EvidenceSignal, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeHeadingText, normalizeParagraphText, normalizeForComparison } from "./textNormalizer";

/** Section ID counter for deterministic ID generation. */
let sectionIdCounter = 0;

/** Reset the section ID counter (for testing determinism). */
export function resetSectionIdCounter(): void {
  sectionIdCounter = 0;
}

/**
 * Generate a deterministic section ID.
 * @param type Section type.
 * @returns Deterministic section ID.
 */
export function generateSectionId(type: string): string {
  return `${type}_${sectionIdCounter++}`;
}

/**
 * Normalize a single evidence signal into a normalized signal.
 * @param signal Source evidence signal.
 * @param isContaminated Whether the source is contaminated.
 * @returns Normalized signal.
 */
export function normalizeSignal(signal: EvidenceSignal, isContaminated: boolean = false): NormalizedSignal {
  const normalizedValue = normalizeParagraphText(signal.value);

  return {
    type: signal.type,
    value: normalizedValue,
    confidence: signal.confidence,
    selector: signal.selector,
    metadata: signal.metadata,
    isContaminated,
  };
}

/**
 * Deduplicate signals within a section based on normalized comparison keys.
 * @param signals Signals to deduplicate.
 * @returns Tuple of [deduplicated signals, duplicates removed count].
 */
export function deduplicateSignals(signals: NormalizedSignal[]): [NormalizedSignal[], number] {
  const seen = new Map<string, NormalizedSignal>();
  let duplicatesRemoved = 0;

  for (const signal of signals) {
    const key = normalizeForComparison(signal.value);
    if (key.length === 0) {
      duplicatesRemoved++;
      continue;
    }

    const existing = seen.get(key);
    if (existing) {
      duplicatesRemoved++;
      // Keep the higher confidence signal
      if (signal.confidence > existing.confidence) {
        seen.set(key, { ...signal, isDuplicate: false });
        existing.isDuplicate = true;
      } else {
        signal.isDuplicate = true;
      }
    } else {
      seen.set(key, signal);
    }
  }

  return [Array.from(seen.values()), duplicatesRemoved];
}

/**
 * Normalize an evidence section into a normalized section.
 * @param section Source evidence section.
 * @param sectionType Override section type (defaults to section.category).
 * @param isContaminated Whether the source is contaminated.
 * @returns Normalized section.
 */
export function normalizeSection(
  section: EvidenceSection,
  sectionType?: string,
  isContaminated: boolean = false,
): NormalizedSection {
  const type = sectionType ?? section.category;
  const id = generateSectionId(type);

  // Normalize all signals
  const normalizedSignals: NormalizedSignal[] = section.signals.map((sig) =>
    normalizeSignal(sig, isContaminated),
  );

  // Deduplicate
  const [dedupedSignals, duplicatesRemoved] = deduplicateSignals(normalizedSignals);

  // Build normalized content from deduplicated signals
  const normalizedContent = dedupedSignals
    .map((s) => s.value)
    .filter((v) => v.length > 0)
    .join(" ");

  return {
    id,
    type,
    normalizedContent,
    normalizedSignals: dedupedSignals,
    sourceSectionId: section.category,
    originalCount: section.signals.length,
    duplicatesRemoved,
    confidence: section.confidence,
  };
}

/**
 * Normalize multiple evidence sections of the same category.
 * @param sections Source evidence sections.
 * @param sectionType Override section type.
 * @param isContaminated Whether the source is contaminated.
 * @returns Array of normalized sections.
 */
export function normalizeSections(
  sections: EvidenceSection[],
  sectionType?: string,
  isContaminated: boolean = false,
): NormalizedSection[] {
  return sections.map((sec) => normalizeSection(sec, sectionType, isContaminated));
}

/**
 * Normalize heading levels — detect and flag skipped levels.
 * @param headings Normalized heading signals.
 * @returns Headings with normalized level metadata.
 */
export function normalizeHeadingLevels(headings: NormalizedSignal[]): NormalizedSignal[] {
  const result: NormalizedSignal[] = [];
  let previousLevel = 0;

  for (const heading of headings) {
    const level = (heading.metadata?.level as number) ?? 0;
    let normalizedLevel = level;
    let levelIssue: string | undefined;

    if (previousLevel > 0 && level > previousLevel + 1) {
      levelIssue = `heading_level_skip: h${previousLevel} → h${level}`;
    }

    result.push({
      ...heading,
      value: normalizeHeadingText(heading.value),
      metadata: {
        ...heading.metadata,
        level: normalizedLevel,
        levelIssue,
        previousLevel,
      },
    });

    previousLevel = level;
  }

  return result;
}

/**
 * Normalize section ordering — sort by document order if available.
 * @param sections Normalized sections to order.
 * @returns Ordered sections.
 */
export function normalizeSectionOrdering(sections: NormalizedSection[]): NormalizedSection[] {
  return [...sections].sort((a, b) => {
    // Sort by type first, then by ID
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Flatten nested list structures into a single-level representation.
 * @param items Nested list items (pipe-delimited).
 * @returns Flattened items array.
 */
export function flattenListItems(items: string[]): string[] {
  const result: string[] = [];
  for (const item of items) {
    // Split on pipe delimiter (used by Phase 2 list extractor)
    const parts = item.split("|").map((p) => normalizeParagraphText(p));
    result.push(...parts.filter((p) => p.length > 0));
  }
  return result;
}

/**
 * Normalize cross-references — detect and standardize internal links.
 * @param signals Link signals to check.
 * @returns Signals with normalized cross-reference metadata.
 */
export function normalizeCrossReferences(signals: NormalizedSignal[]): NormalizedSignal[] {
  return signals.map((signal) => {
    const href = (signal.metadata?.href as string) ?? "";
    const isInternal = href.startsWith("#") || href.startsWith("/") || href.startsWith("./");

    return {
      ...signal,
      metadata: {
        ...signal.metadata,
        isCrossReference: isInternal,
        refType: isInternal ? (href.startsWith("#") ? "anchor" : "relative") : "external",
      },
    };
  });
}
