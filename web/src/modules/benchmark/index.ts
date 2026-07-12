/**
 * Benchmark Module — Placeholder
 * Phase 2 will implement benchmark run execution and aggregation.
 */

import type { BenchmarkRun } from "@/types";

/**
 * Parse a benchmark.txt file into a list of URLs.
 * @param file Uploaded benchmark file.
 * @returns Promise resolving to an array of URLs.
 */
export async function parseBenchmarkFile(file: File): Promise<string[]> {
  // TODO: Implement in Phase 2
  // - Read file as text
  // - Parse one URL per line (strip comments, whitespace)
  // - Validate URLs
  console.debug(`[benchmark] parseBenchmarkFile placeholder — file: ${file.name}`);
  return [];
}

/**
 * Execute a benchmark run across multiple URLs.
 * @param urls URLs to benchmark.
 * @param label Optional label for the run.
 * @param onProgress Callback for progress updates.
 * @returns Promise resolving to the completed benchmark run.
 */
export async function runBenchmark(
  urls: string[],
  label?: string,
  onProgress?: (progress: number, completed: number, total: number) => void,
): Promise<BenchmarkRun> {
  // TODO: Implement in Phase 2
  // - Iterate URLs with concurrency limit
  // - Run audit per URL
  // - Aggregate scores
  // - Report progress via callback
  console.debug(`[benchmark] runBenchmark placeholder — urls: ${urls.length}, label: ${label}`);
  onProgress?.(0, 0, urls.length);
  return {};
}

/**
 * Aggregate results from a completed benchmark run.
 * @param run The benchmark run to aggregate.
 * @returns The run with aggregate score populated (placeholder).
 */
export function aggregateResults(run: BenchmarkRun): BenchmarkRun {
  // TODO: Implement in Phase 2
  console.debug(`[benchmark] aggregateResults placeholder — run: ${run.id}`);
  return run;
}

export function TODO_Benchmark() {
  // TODO: Implement in Phase 2
}
