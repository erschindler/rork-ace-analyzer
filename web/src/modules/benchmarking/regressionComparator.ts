/**
 * Regression Comparator — Phase 6
 * Compares current Regression Mode results to baselines and detects drift.
 *
 * Category-level drift:
 * - >= 5% of cases in category drift
 * - OR any critical metric drift (semanticStructure, extractability, machineComprehension)
 *
 * Corpus-level drift:
 * - >= 2 categories drift
 * - OR >= 10% of all cases drift
 * - OR any schema drift
 */

import type {
  BenchmarkResult,
  BenchmarkBaseline,
  RegressionResult,
  RegressionComparisonResult,
  DriftRecord,
} from "@/types";

import { detectDrift, isCriticalMetricDrift } from "./driftDetector";

/** Threshold for category-level drift (5% of cases). */
const CATEGORY_DRIFT_THRESHOLD = 0.05;

/** Threshold for corpus-level drift by categories (2 categories). */
const CORPUS_CATEGORY_DRIFT_THRESHOLD = 2;

/** Threshold for corpus-level drift by cases (10% of all cases). */
const CORPUS_CASE_DRIFT_THRESHOLD = 0.10;

/**
 * Compare current results to a baseline and detect drift.
 * @param currentResults Current benchmark results.
 * @param baseline Stored baseline.
 * @returns Full regression comparison result.
 */
export function compareRegression(
  currentResults: BenchmarkResult[],
  baseline: BenchmarkBaseline,
): RegressionComparisonResult {
  const regressionResults: RegressionResult[] = [];
  const driftByCase = new Map<string, DriftRecord[]>();
  const driftByCategory: Record<string, number> = {};
  const totalByCategory: Record<string, number> = {};
  let casesWithDrift = 0;
  let schemaDriftCount = 0;

  for (const current of currentResults) {
    const baseResult = baseline.results[current.caseId];

    if (!baseResult) {
      // Case not in baseline — this is a schema drift (new case)
      const drift: DriftRecord = {
        caseId: current.caseId,
        type: "schema",
        baselineValue: "not in baseline",
        currentValue: "present",
        delta: 1,
      };
      regressionResults.push({
        caseId: current.caseId,
        passed: false,
        drift: [drift],
      });
      driftByCase.set(current.caseId, [drift]);
      casesWithDrift++;
      schemaDriftCount++;
      continue;
    }

    const drifts = detectDrift(current, baseResult);
    const passed = drifts.length === 0;

    regressionResults.push({
      caseId: current.caseId,
      passed,
      drift: drifts,
    });

    // Track category counts (always)
    const category = current.category;
    if (!totalByCategory[category]) totalByCategory[category] = 0;
    totalByCategory[category]++;

    if (drifts.length > 0) {
      driftByCase.set(current.caseId, drifts);
      casesWithDrift++;

      if (!driftByCategory[category]) driftByCategory[category] = 0;

      // Check for critical metric drift
      const hasCritical = drifts.some(isCriticalMetricDrift);
      const hasSchema = drifts.some((d) => d.type === "schema");
      if (hasCritical || hasSchema) {
        driftByCategory[category]++;
      } else {
        // Count as drift for percentage calculation
        driftByCategory[category]++;
      }

      if (hasSchema) schemaDriftCount++;
    }
  }

  // Also check for baseline cases missing from current results
  for (const baseCaseId of Object.keys(baseline.results)) {
    if (!currentResults.find((r) => r.caseId === baseCaseId)) {
      const drift: DriftRecord = {
        caseId: baseCaseId,
        type: "schema",
        baselineValue: "present",
        currentValue: "missing",
        delta: -1,
      };
      regressionResults.push({
        caseId: baseCaseId,
        passed: false,
        drift: [drift],
      });
      casesWithDrift++;
      schemaDriftCount++;
    }
  }

  // Determine which categories have drift
  const categoriesWithDrift: string[] = [];
  for (const [category, driftCount] of Object.entries(driftByCategory)) {
    const total = totalByCategory[category] ?? 0;
    const driftRatio = total > 0 ? driftCount / total : 0;

    if (driftRatio >= CATEGORY_DRIFT_THRESHOLD) {
      categoriesWithDrift.push(category);
    }
  }

  // Determine corpus-level drift
  const totalCases = currentResults.length;
  const caseDriftRatio = totalCases > 0 ? casesWithDrift / totalCases : 0;

  let corpusDrift = false;
  let corpusDriftReason = "";

  if (schemaDriftCount > 0) {
    corpusDrift = true;
    corpusDriftReason = `Schema drift detected in ${schemaDriftCount} case(s)`;
  } else if (categoriesWithDrift.length >= CORPUS_CATEGORY_DRIFT_THRESHOLD) {
    corpusDrift = true;
    corpusDriftReason = `${categoriesWithDrift.length} categories have drift (>= ${CORPUS_CATEGORY_DRIFT_THRESHOLD})`;
  } else if (caseDriftRatio >= CORPUS_CASE_DRIFT_THRESHOLD) {
    corpusDrift = true;
    corpusDriftReason = `${(caseDriftRatio * 100).toFixed(1)}% of cases have drift (>= ${(CORPUS_CASE_DRIFT_THRESHOLD * 100).toFixed(0)}%)`;
  }

  return {
    results: regressionResults,
    corpusDrift,
    corpusDriftReason,
    categoriesWithDrift,
    totalCases,
    casesWithDrift,
  };
}
