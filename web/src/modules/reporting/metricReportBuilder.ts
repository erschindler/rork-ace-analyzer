/**
 * Metric Report Builder — Phase 5
 * Converts MetricScore objects into report-ready MetricReport objects.
 * Preserves formulas, component breakdowns, evidence, weaknesses, and recommendations.
 * Enforces deterministic metric ordering.
 */

import type { MetricScore, MetricReport, Recommendation } from "@/types";
import { METRIC_KEYS, METRIC_NAMES, type MetricKey } from "@/modules/scoring/scoringTypes";

/**
 * Convert a single MetricScore into a report-ready MetricReport.
 * Does NOT recompute anything — only transforms the representation.
 * @param key Metric key (e.g. "readability").
 * @param metric The MetricScore from the scoring engine.
 * @returns Report-ready MetricReport.
 */
export function buildMetricReport(key: string, metric: MetricScore): MetricReport {
  const displayName = METRIC_NAMES[key as MetricKey] ?? key;

  return {
    metric: key,
    displayName,
    score: metric.score,
    confidence: metric.confidence,
    status: metric.status,
    formula: metric.calculation.formula,
    components: { ...metric.calculation.components },
    inputs: sanitizeJsonSafe(metric.calculation.inputs),
    evidence: [...metric.evidence],
    weaknesses: [...metric.weaknesses],
    recommendations: metric.recommendations.map(cloneRecommendation),
  };
}

/**
 * Build all metric reports in deterministic order from an ACEScore's metrics.
 * @param metrics The metrics object from ACEScore.
 * @returns Record of metric key → MetricReport, in deterministic order.
 */
export function buildAllMetricReports(
  metrics: Record<string, MetricScore>,
): Record<string, MetricReport> {
  const reports: Record<string, MetricReport> = {};
  for (const key of METRIC_KEYS) {
    const metric = metrics[key];
    if (metric) {
      reports[key] = buildMetricReport(key, metric);
    }
  }
  return reports;
}

/**
 * Get metric keys in deterministic order.
 * @returns Array of metric keys in fixed order.
 */
export function getOrderedMetricKeys(): string[] {
  return [...METRIC_KEYS];
}

/**
 * Clone a recommendation to ensure JSON-safe, isolated copy.
 */
function cloneRecommendation(r: Recommendation): Recommendation {
  return {
    id: r.id,
    category: r.category,
    priority: r.priority,
    message: r.message,
  };
}

/**
 * Recursively sanitize a value to ensure it's JSON-serializable.
 * Converts undefined → null, functions → "[function]", symbols → "[symbol]".
 */
function sanitizeJsonSafe(value: unknown): Record<string, unknown> {
  if (value === null || typeof value === "undefined") {
    return {};
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = sanitizeValue(v);
    }
    return result;
  }
  // Non-object input — wrap in a default key
  return { value: sanitizeValue(value) };
}

/**
 * Sanitize a single value for JSON safety.
 */
function sanitizeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val === "string" || typeof val === "number" || typeof val === "boolean") {
    return val;
  }
  if (typeof val === "function") return "[function]";
  if (typeof val === "symbol") return "[symbol]";
  if (typeof val === "bigint") return val.toString();
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (typeof val === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      result[k] = sanitizeValue(v);
    }
    return result;
  }
  return String(val);
}
