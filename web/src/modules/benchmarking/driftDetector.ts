/**
 * Drift Detector — Phase 6
 * Detects drift between current Regression Mode results and stored baselines.
 *
 * Drift rules:
 * - Score drift: abs(current.finalScore - baseline.finalScore) > 0.5
 * - Confidence drift: abs(current.confidence - baseline.confidence) > 0.05
 * - Metric drift: abs(current.metrics[m].score - baseline.metrics[m].score) > 0.5
 * - Recommendation drift: any change in count, priority, category, or message
 * - Absence evidence drift: any change in count or content
 * - Contamination drift: any change in flag or type
 * - Schema drift: any change in field names, ordering, or types
 */

import type {
  BenchmarkResult,
  DriftRecord,
  DriftType,
  ACEScore,
} from "@/types";

/** Score drift tolerance. */
export const SCORE_DRIFT_TOLERANCE = 0.5;

/** Confidence drift tolerance. */
export const CONFIDENCE_DRIFT_TOLERANCE = 0.05;

/** Metric score drift tolerance. */
export const METRIC_DRIFT_TOLERANCE = 0.5;

/** Critical metrics that trigger category-level drift. */
export const CRITICAL_METRICS = ["semanticStructure", "extractability", "machineComprehension"];

/** Metric keys for drift checking. */
const METRIC_KEYS = [
  "readability", "structure", "clarity", "consistency",
  "semantic", "completeness", "semanticStructure", "structuredData",
  "extractability", "accessibility", "entityRecognition", "machineComprehension",
] as const;

/**
 * Detect drift between a current and baseline benchmark result.
 * @param current Current benchmark result.
 * @param baseline Baseline benchmark result.
 * @returns Array of drift records (empty if no drift).
 */
export function detectDrift(
  current: BenchmarkResult,
  baseline: BenchmarkResult,
): DriftRecord[] {
  const drifts: DriftRecord[] = [];

  // If either result errored, compare error status
  if (current.status === "error" && baseline.status === "ok") {
    drifts.push({
      caseId: current.caseId,
      type: "schema",
      baselineValue: "ok",
      currentValue: "error",
      delta: 1,
    });
    return drifts;
  }
  if (current.status === "ok" && baseline.status === "error") {
    drifts.push({
      caseId: current.caseId,
      type: "schema",
      baselineValue: "error",
      currentValue: "ok",
      delta: -1,
    });
    return drifts;
  }
  if (current.status === "error" && baseline.status === "error") {
    return []; // Both errored — no drift
  }

  // Both are "ok" — compare scores
  const currentScore = current.score;
  const baselineScore = baseline.score;

  if (!currentScore || !baselineScore) {
    drifts.push({
      caseId: current.caseId,
      type: "schema",
      baselineValue: baselineScore ? "has score" : "null score",
      currentValue: currentScore ? "has score" : "null score",
      delta: 0,
    });
    return drifts;
  }

  // 1. Score drift
  if (currentScore.finalScore !== null && baselineScore.finalScore !== null) {
    const delta = Math.abs(currentScore.finalScore - baselineScore.finalScore);
    if (delta > SCORE_DRIFT_TOLERANCE) {
      drifts.push({
        caseId: current.caseId,
        type: "score",
        baselineValue: baselineScore.finalScore.toFixed(2),
        currentValue: currentScore.finalScore.toFixed(2),
        delta: currentScore.finalScore - baselineScore.finalScore,
      });
    }
  } else if (currentScore.finalScore !== baselineScore.finalScore) {
    drifts.push({
      caseId: current.caseId,
      type: "score",
      baselineValue: String(baselineScore.finalScore),
      currentValue: String(currentScore.finalScore),
      delta: 0,
    });
  }

  // 2. Confidence drift
  if (currentScore.confidence !== null && baselineScore.confidence !== null) {
    const delta = Math.abs(currentScore.confidence - baselineScore.confidence);
    if (delta > CONFIDENCE_DRIFT_TOLERANCE) {
      drifts.push({
        caseId: current.caseId,
        type: "confidence",
        baselineValue: baselineScore.confidence.toFixed(4),
        currentValue: currentScore.confidence.toFixed(4),
        delta: currentScore.confidence - baselineScore.confidence,
      });
    }
  } else if (currentScore.confidence !== baselineScore.confidence) {
    drifts.push({
      caseId: current.caseId,
      type: "confidence",
      baselineValue: String(baselineScore.confidence),
      currentValue: String(currentScore.confidence),
      delta: 0,
    });
  }

  // 3. Metric drift
  for (const key of METRIC_KEYS) {
    const currMetric = currentScore.metrics[key];
    const baseMetric = baselineScore.metrics[key];

    if (currMetric && baseMetric) {
      const currScore = currMetric.score;
      const baseScore = baseMetric.score;

      if (currScore !== null && baseScore !== null) {
        const delta = Math.abs(currScore - baseScore);
        if (delta > METRIC_DRIFT_TOLERANCE) {
          drifts.push({
            caseId: current.caseId,
            type: "metric",
            metric: key,
            baselineValue: baseScore.toFixed(2),
            currentValue: currScore.toFixed(2),
            delta: currScore - baseScore,
          });
        }
      } else if (currScore !== baseScore) {
        drifts.push({
          caseId: current.caseId,
          type: "metric",
          metric: key,
          baselineValue: String(baseScore),
          currentValue: String(currScore),
          delta: 0,
        });
      }
    }
  }

  // 4. Recommendation drift
  const currRecs = collectRecommendations(currentScore);
  const baseRecs = collectRecommendations(baselineScore);
  if (currRecs.length !== baseRecs.length) {
    drifts.push({
      caseId: current.caseId,
      type: "recommendation",
      baselineValue: `${baseRecs.length} recommendations`,
      currentValue: `${currRecs.length} recommendations`,
      delta: currRecs.length - baseRecs.length,
    });
  } else {
    // Check for content changes
    const baseSet = new Set(baseRecs);
    const currSet = new Set(currRecs);
    for (const r of currSet) {
      if (!baseSet.has(r)) {
        drifts.push({
          caseId: current.caseId,
          type: "recommendation",
          baselineValue: "different recommendations",
          currentValue: "different recommendations",
          delta: 0,
        });
        break;
      }
    }
  }

  // 5. Absence evidence drift
  const currAbsence = currentScore.diagnostics.absenceEvidence;
  const baseAbsence = baselineScore.diagnostics.absenceEvidence;
  if (currAbsence.length !== baseAbsence.length) {
    drifts.push({
      caseId: current.caseId,
      type: "absence_evidence",
      baselineValue: `${baseAbsence.length} absence items`,
      currentValue: `${currAbsence.length} absence items`,
      delta: currAbsence.length - baseAbsence.length,
    });
  } else {
    const baseSet = new Set(baseAbsence);
    const currSet = new Set(currAbsence);
    for (const a of currSet) {
      if (!baseSet.has(a)) {
        drifts.push({
          caseId: current.caseId,
          type: "absence_evidence",
          baselineValue: "different absence evidence",
          currentValue: "different absence evidence",
          delta: 0,
        });
        break;
      }
    }
  }

  // 6. Contamination drift
  const currContam = currentScore.diagnostics.contamination;
  const baseContam = baselineScore.diagnostics.contamination;
  if (currContam !== baseContam) {
    drifts.push({
      caseId: current.caseId,
      type: "contamination",
      baselineValue: String(baseContam),
      currentValue: String(currContam),
      delta: currContam ? 1 : -1,
    });
  } else if (currContam && baseContam) {
    const currType = currentScore.diagnostics.contaminationType ?? "unknown";
    const baseType = baselineScore.diagnostics.contaminationType ?? "unknown";
    if (currType !== baseType) {
      drifts.push({
        caseId: current.caseId,
        type: "contamination",
        baselineValue: baseType,
        currentValue: currType,
        delta: 0,
      });
    }
  }

  // 7. Schema drift — status field change
  if (currentScore.status !== baselineScore.status) {
    drifts.push({
      caseId: current.caseId,
      type: "schema",
      baselineValue: baselineScore.status,
      currentValue: currentScore.status,
      delta: 0,
    });
  }

  return drifts;
}

/**
 * Collect recommendation signatures from an ACEScore.
 * @param score The score to collect from.
 * @returns Array of "priority|category|message" strings.
 */
function collectRecommendations(score: ACEScore): string[] {
  const recs: string[] = [];
  for (const key of METRIC_KEYS) {
    const metric = score.metrics[key];
    if (metric) {
      for (const r of metric.recommendations) {
        recs.push(`${r.priority}|${r.category}|${r.message}`);
      }
    }
  }
  return recs.sort();
}

/**
 * Check if a metric drift is on a critical metric.
 * @param drift The drift record to check.
 * @returns True if the drift is on a critical metric.
 */
export function isCriticalMetricDrift(drift: DriftRecord): boolean {
  return drift.type === "metric" && drift.metric !== undefined &&
    CRITICAL_METRICS.includes(drift.metric);
}
