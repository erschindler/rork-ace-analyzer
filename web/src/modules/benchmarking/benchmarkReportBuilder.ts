/**
 * Benchmark Report Builder — Phase 6
 * Produces Benchmark Summary Report, Regression Report, and Drift Report.
 * All reports are JSON-serializable and deterministically ordered.
 */

import type {
  BenchmarkResult,
  BenchmarkCorpus,
  MultiSiteBenchmarkSummary,
  RegressionComparisonResult,
  DriftRecord,
  BenchmarkSummaryReport,
  RegressionReport,
  DriftReport,
  AceVersionMetadata,
} from "@/types";

import { computeCorpusHash } from "./corpusUtils";
import { REPORTING_VERSION, SCHEMA_VERSION } from "@/modules/reporting/versionMetadataBuilder";

/** Benchmark version. */
export const BENCHMARK_REPORT_VERSION = "1.0.0";

/**
 * Build the version metadata for benchmark reports.
 * @returns AceVersionMetadata with benchmark-specific versions.
 */
function buildBenchmarkVersionMetadata(): AceVersionMetadata {
  return {
    evidence: "1.2.0",
    normalization: "1.2.0",
    scoring: "1.2.0",
    metrics: "1.2.0",
    weighting: "1.2.0",
    reporting: REPORTING_VERSION,
    schema: SCHEMA_VERSION,
  };
}

/**
 * Build a Benchmark Summary Report.
 * @param corpus The corpus that was run.
 * @param results Benchmark results.
 * @param summary Multi-site summary.
 * @param mode Benchmark mode.
 * @returns BenchmarkSummaryReport.
 */
export function buildBenchmarkSummaryReport(
  corpus: BenchmarkCorpus,
  results: BenchmarkResult[],
  summary: MultiSiteBenchmarkSummary,
  mode: "regression" | "live",
): BenchmarkSummaryReport {
  const version = buildBenchmarkVersionMetadata();
  const corpusHash = computeCorpusHash(corpus);

  // Compute average and median scores from successful results
  const scores: number[] = [];
  for (const r of results) {
    if (r.status === "ok" && r.score && r.score.finalScore !== null) {
      scores.push(r.score.finalScore);
    }
  }

  const averageScore = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : null;

  const sortedScores = [...scores].sort((a, b) => a - b);
  const medianScore = sortedScores.length > 0
    ? sortedScores.length % 2 === 0
      ? Math.round(((sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2) * 100) / 100
      : sortedScores[Math.floor(sortedScores.length / 2)]
    : null;

  return {
    version,
    timestamp: Date.now(),
    mode,
    corpusHash,
    totalSites: summary.totalSites,
    passed: summary.passed,
    failed: summary.failed,
    averageScore,
    medianScore,
    categories: summary.categories,
    performance: summary.performance,
  };
}

/**
 * Build a Regression Report from comparison results.
 * @param corpus The corpus that was compared.
 * @param comparison The regression comparison result.
 * @param baselineVersion The baseline version string.
 * @returns RegressionReport.
 */
export function buildRegressionReport(
  corpus: BenchmarkCorpus,
  comparison: RegressionComparisonResult,
  baselineVersion: string,
): RegressionReport {
  const version = buildBenchmarkVersionMetadata();
  const corpusHash = computeCorpusHash(corpus);

  return {
    version,
    timestamp: Date.now(),
    corpusHash,
    baselineVersion,
    totalCases: comparison.totalCases,
    casesWithDrift: comparison.casesWithDrift,
    corpusDrift: comparison.corpusDrift,
    corpusDriftReason: comparison.corpusDriftReason,
    categoriesWithDrift: [...comparison.categoriesWithDrift].sort(),
    results: comparison.results,
  };
}

/**
 * Build a Drift Report from drift records.
 * @param comparison The regression comparison result.
 * @returns DriftReport.
 */
export function buildDriftReport(
  comparison: RegressionComparisonResult,
): DriftReport {
  const version = buildBenchmarkVersionMetadata();

  // Collect all drift records
  const allDrifts: DriftRecord[] = [];
  for (const r of comparison.results) {
    allDrifts.push(...r.drift);
  }

  // Sort by caseId, then type
  allDrifts.sort((a, b) => {
    if (a.caseId !== b.caseId) return a.caseId.localeCompare(b.caseId);
    return a.type.localeCompare(b.type);
  });

  // Count by type
  const driftByType: Record<string, number> = {};
  for (const d of allDrifts) {
    driftByType[d.type] = (driftByType[d.type] ?? 0) + 1;
  }

  // Count by category (derive from case results)
  const driftByCategory: Record<string, number> = {};
  for (const r of comparison.results) {
    if (r.drift.length > 0) {
      // We need the category — derive from the regression result
      // The category is embedded in the caseId prefix or the BenchmarkResult
      const caseId = r.caseId;
      const categoryMatch = caseId.match(/^([a-z]+)_/);
      const category = categoryMatch ? categoryMatch[1] : "unknown";
      driftByCategory[category] = (driftByCategory[category] ?? 0) + 1;
    }
  }

  return {
    version,
    timestamp: Date.now(),
    totalDriftRecords: allDrifts.length,
    driftByType,
    driftByCategory,
    records: allDrifts,
  };
}
