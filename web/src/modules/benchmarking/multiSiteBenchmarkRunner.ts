/**
 * Multi-Site Benchmark Runner — Phase 6
 * Runs a CSV-driven corpus across 1600+ sites with deterministic result collection.
 * Sorts results by category, then caseId before serialization.
 */

import type {
  BenchmarkCorpus,
  BenchmarkResult,
  MultiSiteBenchmarkResult,
  MultiSiteBenchmarkSummary,
  CategoryBenchmarkSummary,
  BenchmarkPerformance,
  DriftRecord,
} from "@/types";

import { runBenchmarkCorpusAsync } from "./benchmarkRunner";

/**
 * Run a full multi-site benchmark.
 * @param corpus The benchmark corpus (typically from CsvCorpusProvider).
 * @param mode Benchmark mode (regression or live).
 * @param concurrency Number of concurrent cases.
 * @param onProgress Optional progress callback.
 * @returns Multi-site benchmark result with summary.
 */
export async function runMultiSiteBenchmark(
  corpus: BenchmarkCorpus,
  mode: "regression" | "live" = "regression",
  concurrency: number = 3,
  onProgress?: (completed: number, total: number, caseId: string) => void,
): Promise<MultiSiteBenchmarkResult> {
  const results = await runBenchmarkCorpusAsync(corpus, mode, concurrency, onProgress);

  // Sort results by category, then caseId
  const sortedResults = sortResults(results);

  // Build summary
  const summary = buildMultiSiteSummary(sortedResults, corpus);

  return {
    corpus,
    results: sortedResults,
    summary,
  };
}

/**
 * Sort benchmark results by category, then caseId (deterministic).
 * @param results Results to sort.
 * @returns New sorted array.
 */
export function sortResults(results: BenchmarkResult[]): BenchmarkResult[] {
  return [...results].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.caseId.localeCompare(b.caseId);
  });
}

/**
 * Build the multi-site benchmark summary from results.
 * @param results Sorted benchmark results.
 * @param corpus The corpus that was run.
 * @returns Summary with category breakdowns and performance metrics.
 */
export function buildMultiSiteSummary(
  results: BenchmarkResult[],
  corpus: BenchmarkCorpus,
): MultiSiteBenchmarkSummary {
  const totalSites = results.length;
  let passed = 0;
  let failed = 0;

  const categoryMap: Record<string, CategoryBenchmarkSummary> = {};
  const runtimes: number[] = [];

  for (const r of results) {
    // Initialize category if needed
    if (!categoryMap[r.category]) {
      categoryMap[r.category] = {
        category: r.category,
        total: 0,
        passed: 0,
        failed: 0,
        driftDetected: 0,
      };
    }

    categoryMap[r.category].total++;

    if (r.status === "ok") {
      passed++;
      categoryMap[r.category].passed++;
    } else {
      failed++;
      categoryMap[r.category].failed++;
    }

    runtimes.push(r.executionTimeMs);
  }

  // Compute performance metrics
  const performance = computePerformance(runtimes, results);

  return {
    totalSites,
    passed,
    failed,
    driftDetected: 0, // Updated by regression comparator if baseline is compared
    categories: categoryMap,
    performance,
  };
}

/**
 * Compute performance metrics from runtimes.
 * @param runtimes Array of execution times in ms.
 * @param results Full results array (for finding slowest/fastest page IDs).
 * @returns Performance metrics.
 */
function computePerformance(
  runtimes: number[],
  results: BenchmarkResult[],
): BenchmarkPerformance {
  if (runtimes.length === 0) {
    return {
      averageRuntimeMs: 0,
      medianRuntimeMs: 0,
      slowestPageId: "",
      fastestPageId: "",
    };
  }

  const sum = runtimes.reduce((a, b) => a + b, 0);
  const avg = sum / runtimes.length;

  const sorted = [...runtimes].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];

  // Find slowest and fastest by execution time
  let slowest = results[0];
  let fastest = results[0];
  for (const r of results) {
    if (r.executionTimeMs > slowest.executionTimeMs) slowest = r;
    if (r.executionTimeMs < fastest.executionTimeMs) fastest = r;
  }

  return {
    averageRuntimeMs: Math.round(avg * 100) / 100,
    medianRuntimeMs: Math.round(median * 100) / 100,
    slowestPageId: slowest.caseId,
    fastestPageId: fastest.caseId,
  };
}

/**
 * Update summary with drift detection results.
 * @param summary Original summary.
 * @param driftByCase Map of caseId → drift records.
 * @returns Updated summary with drift counts.
 */
export function updateSummaryWithDrift(
  summary: MultiSiteBenchmarkSummary,
  driftByCase: Map<string, DriftRecord[]>,
): MultiSiteBenchmarkSummary {
  let totalDrift = 0;
  const categories = { ...summary.categories };

  for (const [caseId, drifts] of driftByCase) {
    if (drifts.length > 0) {
      totalDrift++;
      // Find the category for this case
      for (const r of summary.categories ? Object.values(categories) : []) {
        // The caseId→category mapping is in the results, not the summary
        // We need to find it from the original results
      }
    }
  }

  return {
    ...summary,
    driftDetected: totalDrift,
  };
}
