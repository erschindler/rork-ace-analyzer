/**
 * Baseline Manager — Phase 6
 * Stores, loads, and versions baselines for Regression Mode.
 * Ensures JSON-safe storage with deterministic ordering.
 */

import type {
  BenchmarkBaseline,
  BenchmarkResult,
  BenchmarkCorpus,
  AceVersionMetadata,
} from "@/types";

import { computeCorpusHash } from "./corpusUtils";
import { REPORTING_VERSION, SCHEMA_VERSION } from "@/modules/reporting/versionMetadataBuilder";

/** Benchmark engine version. */
export const BENCHMARK_VERSION = "1.0.0";

/** ACE version string. */
export const ACE_VERSION = "1.2.0";

/**
 * Create a baseline from benchmark results.
 * @param corpus The corpus that was run.
 * @param results Benchmark results to store as baseline.
 * @returns A BenchmarkBaseline object.
 */
export function createBaseline(
  corpus: BenchmarkCorpus,
  results: BenchmarkResult[],
): BenchmarkBaseline {
  const corpusHash = computeCorpusHash(corpus);

  // Build results map keyed by caseId (deterministic)
  const resultsMap: Record<string, BenchmarkResult> = {};
  for (const r of results) {
    resultsMap[r.caseId] = r;
  }

  const version: AceVersionMetadata = {
    evidence: "1.2.0",
    normalization: "1.2.0",
    scoring: "1.2.0",
    metrics: "1.2.0",
    weighting: "1.2.0",
    reporting: REPORTING_VERSION,
    schema: SCHEMA_VERSION,
  };

  return {
    aceVersion: ACE_VERSION,
    benchmarkVersion: BENCHMARK_VERSION,
    corpusHash,
    version,
    results: resultsMap,
  };
}

/**
 * Serialize a baseline to a JSON string.
 * Ensures deterministic key ordering.
 * @param baseline The baseline to serialize.
 * @returns JSON string.
 */
export function serializeBaseline(baseline: BenchmarkBaseline): string {
  return JSON.stringify(baseline, null, 2);
}

/**
 * Deserialize a baseline from a JSON string.
 * Validates the structure and returns null if corrupted.
 * @param json JSON string.
 * @returns Parsed baseline or null if invalid.
 */
export function deserializeBaseline(json: string): BenchmarkBaseline | null {
  try {
    const parsed = JSON.parse(json);

    // Validate structure
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.aceVersion !== "string") return null;
    if (typeof parsed.benchmarkVersion !== "string") return null;
    if (typeof parsed.corpusHash !== "string") return null;
    if (!parsed.version || typeof parsed.version !== "object") return null;
    if (!parsed.results || typeof parsed.results !== "object") return null;

    // Validate each result entry has required fields
    for (const [key, val] of Object.entries(parsed.results)) {
      const r = val as BenchmarkResult;
      if (!r.caseId || typeof r.caseId !== "string") return null;
      if (!r.category || typeof r.category !== "string") return null;
      if (r.status !== "ok" && r.status !== "error") return null;
    }

    return parsed as BenchmarkBaseline;
  } catch {
    return null;
  }
}

/**
 * Check if a baseline is compatible with a corpus.
 * Compares corpus hashes.
 * @param baseline The baseline to check.
 * @param corpus The corpus to compare against.
 * @returns True if the baseline was created from the same corpus definition.
 */
export function isBaselineCompatible(
  baseline: BenchmarkBaseline,
  corpus: BenchmarkCorpus,
): boolean {
  const currentHash = computeCorpusHash(corpus);
  return baseline.corpusHash === currentHash;
}

/**
 * Store a baseline to localStorage (for browser persistence).
 * @param key Storage key.
 * @param baseline The baseline to store.
 */
export function storeBaseline(key: string, baseline: BenchmarkBaseline): void {
  try {
    localStorage.setItem(key, serializeBaseline(baseline));
  } catch {
    // Storage may be full or unavailable
  }
}

/**
 * Load a baseline from localStorage.
 * @param key Storage key.
 * @returns Parsed baseline or null if not found/corrupted.
 */
export function loadBaseline(key: string): BenchmarkBaseline | null {
  try {
    const json = localStorage.getItem(key);
    if (!json) return null;
    return deserializeBaseline(json);
  } catch {
    return null;
  }
}

/**
 * Check if a baseline is corrupted.
 * @param json Raw JSON string.
 * @returns True if the baseline is corrupted/invalid.
 */
export function isBaselineCorrupted(json: string): boolean {
  return deserializeBaseline(json) === null;
}
