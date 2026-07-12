/**
 * Corpus Utilities — Phase 6
 * Shared utilities for corpus hashing, validation, and deterministic ordering.
 */

import type { BenchmarkCorpus, BenchmarkCase } from "@/types";

/**
 * Compute a deterministic hash of a corpus definition.
 * The hash is based on cases, ordering, URLs, and snapshots.
 * @param corpus The corpus to hash.
 * @returns A deterministic hex hash string.
 */
export function computeCorpusHash(corpus: BenchmarkCorpus): string {
  // Build a deterministic string representation
  const parts: string[] = [];
  for (const c of corpus.cases) {
    parts.push(`${c.id}|${c.category}|${c.url ?? ""}|${c.snapshotHtml ? c.snapshotHtml.length.toString() : "0"}|${c.expectedType ?? ""}|${(c.tags ?? []).join(",")}`);
  }
  const str = parts.join("\n");

  // FNV-1a hash (deterministic, no dependencies)
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Convert to unsigned hex
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Sort corpus cases deterministically by category (alphabetical),
 * then by page_id (string-stable).
 * @param cases Cases to sort.
 * @returns New sorted array.
 */
export function sortCasesDeterministic(cases: BenchmarkCase[]): BenchmarkCase[] {
  return [...cases].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.id.localeCompare(b.id);
  });
}

/**
 * Validate a URL string.
 * @param url URL to validate.
 * @returns True if valid.
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validate a benchmark case.
 * @param c Case to validate.
 * @returns Array of validation error strings (empty if valid).
 */
export function validateCase(c: BenchmarkCase): string[] {
  const errors: string[] = [];
  if (!c.id || c.id.trim() === "") errors.push("Missing page_id");
  if (!c.category || c.category.trim() === "") errors.push("Missing or empty category");
  if (c.url && !isValidUrl(c.url)) errors.push(`Invalid URL: ${c.url}`);
  if (!c.url && !c.snapshotHtml) errors.push("Must have either url or snapshotHtml");
  return errors;
}

/**
 * Check for duplicate page_ids in a set of cases.
 * @param cases Cases to check.
 * @returns Array of duplicate IDs.
 */
export function findDuplicateIds(cases: BenchmarkCase[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const c of cases) {
    if (seen.has(c.id)) {
      if (!duplicates.includes(c.id)) duplicates.push(c.id);
    }
    seen.add(c.id);
  }
  return duplicates;
}

/**
 * Check for duplicate URLs in a set of cases.
 * @param cases Cases to check.
 * @returns Array of duplicate URLs.
 */
export function findDuplicateUrls(cases: BenchmarkCase[]): string[] {
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const c of cases) {
    if (c.url) {
      if (seen.has(c.url)) {
        if (!duplicates.includes(c.url)) duplicates.push(c.url);
      }
      seen.add(c.url);
    }
  }
  return duplicates;
}
