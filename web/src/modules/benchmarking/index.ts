/**
 * Benchmarking Module — Phase 6 (ACE Benchmarking)
 * Complete benchmarking & regression system: deterministic, corpus-driven, snapshot-aware.
 *
 * Public API:
 * - runBenchmarkCase(case, mode) — run single case through ACE pipeline
 * - runBenchmarkCorpus(corpus, mode) — run all cases synchronously
 * - runBenchmarkCorpusAsync(corpus, mode, concurrency) — run with concurrency
 * - runMultiSiteBenchmark(corpus, mode, concurrency) — full multi-site benchmark
 *
 * Corpus Providers:
 * - CsvCorpusProvider — CSV-driven corpus loader
 * - SnapshotCorpusProvider — stored HTML snapshot corpus loader
 * - parseCsv(csv) — parse CSV string
 * - validateCsv(rows) — validate CSV structure
 * - generateSyntheticCorpusCsv() — generate 1600-site test corpus (8×200)
 * - createSnapshotProvider(entries) — quick snapshot provider factory
 *
 * Baseline Management:
 * - createBaseline(corpus, results) — create baseline from results
 * - serializeBaseline(baseline) — to JSON
 * - deserializeBaseline(json) — from JSON
 * - isBaselineCompatible(baseline, corpus) — check hash match
 * - storeBaseline(key, baseline) / loadBaseline(key) — localStorage
 * - isBaselineCorrupted(json) — check validity
 *
 * Regression & Drift:
 * - compareRegression(currentResults, baseline) — full comparison
 * - detectDrift(current, baseline) — single case drift detection
 * - isCriticalMetricDrift(drift) — check if drift is on critical metric
 *
 * Reports:
 * - buildBenchmarkSummaryReport(corpus, results, summary, mode)
 * - buildRegressionReport(corpus, comparison, baselineVersion)
 * - buildDriftReport(comparison)
 *
 * Utilities:
 * - computeCorpusHash(corpus) — deterministic hash
 * - sortCasesDeterministic(cases) — sort by category, then id
 * - sortResults(results) — sort results by category, then caseId
 */

// ─── Benchmark Runner (public API) ──────────────────────────────────
export {
  runBenchmarkCase,
  runBenchmarkCorpus,
  runBenchmarkCorpusAsync,
  setBenchmarkPipeline,
  createMockPipeline,
  createMockNormalizedPipeline,
  createMockScorePipeline,
  type BenchmarkPipelineFn,
} from "./benchmarkRunner";

// ─── Multi-Site Runner ───────────────────────────────────────────────
export {
  runMultiSiteBenchmark,
  sortResults,
  buildMultiSiteSummary,
} from "./multiSiteBenchmarkRunner";

// ─── Corpus Providers ────────────────────────────────────────────────
export { CsvCorpusProvider, parseCsv, validateCsv, rowsToCorpus, generateSyntheticCorpusCsv } from "./corpus/csvCorpusProvider";
export type { CsvValidationResult } from "./corpus/csvCorpusProvider";
export { SnapshotCorpusProvider, createSnapshotProvider } from "./corpus/snapshotCorpusProvider";
export type { SnapshotEntry } from "./corpus/snapshotCorpusProvider";

// ─── Baseline Manager ────────────────────────────────────────────────
export {
  createBaseline,
  serializeBaseline,
  deserializeBaseline,
  isBaselineCompatible,
  storeBaseline,
  loadBaseline,
  isBaselineCorrupted,
  BENCHMARK_VERSION,
  ACE_VERSION,
} from "./baselineManager";

// ─── Regression Comparator ───────────────────────────────────────────
export { compareRegression } from "./regressionComparator";

// ─── Drift Detector ──────────────────────────────────────────────────
export {
  detectDrift,
  isCriticalMetricDrift,
  SCORE_DRIFT_TOLERANCE,
  CONFIDENCE_DRIFT_TOLERANCE,
  METRIC_DRIFT_TOLERANCE,
  CRITICAL_METRICS,
} from "./driftDetector";

// ─── Benchmark Report Builder ────────────────────────────────────────
export {
  buildBenchmarkSummaryReport,
  buildRegressionReport,
  buildDriftReport,
  BENCHMARK_REPORT_VERSION,
} from "./benchmarkReportBuilder";

// ─── Corpus Utilities ────────────────────────────────────────────────
export {
  computeCorpusHash,
  sortCasesDeterministic,
  isValidUrl,
  validateCase,
  findDuplicateIds,
  findDuplicateUrls,
} from "./corpusUtils";
