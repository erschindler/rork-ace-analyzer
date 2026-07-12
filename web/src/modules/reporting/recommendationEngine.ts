/**
 * Recommendation Engine — Phase 5
 * Aggregates, deduplicates, and prioritizes recommendations from metric scores.
 *
 * CRITICAL RULE: This engine MUST NOT invent new recommendations.
 * It only collects, deduplicates, and sorts recommendations that were
 * already produced by the scoring engine (Phase 4).
 */

import type { ACEScore, MetricScore, Recommendation } from "@/types";
import { METRIC_KEYS } from "@/modules/scoring/scoringTypes";

/** Recommendation with associated metric key for sorting. */
interface TaggedRecommendation extends Recommendation {
  metric: string;
}

/**
 * Collect all recommendations from all metrics in deterministic metric order.
 * @param score The ACEScore to collect from.
 * @returns Array of tagged recommendations in metric order.
 */
export function collectAllRecommendations(score: ACEScore): TaggedRecommendation[] {
  const all: TaggedRecommendation[] = [];
  for (const key of METRIC_KEYS) {
    const metric = score.metrics[key as keyof typeof score.metrics];
    if (metric && metric.recommendations.length > 0) {
      for (const r of metric.recommendations) {
        all.push({
          id: r.id,
          category: r.category,
          priority: r.priority,
          message: r.message,
          metric: key,
        });
      }
    }
  }
  return all;
}

/**
 * Deduplicate recommendations by (category, message) tuple.
 * Keeps the first occurrence (deterministic — from earliest metric in order).
 * @param recs Tagged recommendations to deduplicate.
 * @returns Deduplicated array preserving first occurrence order.
 */
export function deduplicateRecommendations(recs: TaggedRecommendation[]): TaggedRecommendation[] {
  const seen = new Set<string>();
  const result: TaggedRecommendation[] = [];
  for (const r of recs) {
    const key = `${r.category}|${r.message}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(r);
    }
  }
  return result;
}

/**
 * Sort recommendations deterministically:
 * 1. priority (high → medium → low)
 * 2. category (alphabetical)
 * 3. metric name (alphabetical)
 * 4. message (alphabetical tie-break)
 * @param recs Recommendations to sort.
 * @returns Sorted array (new array, does not mutate input).
 */
export function sortRecommendations(recs: TaggedRecommendation[]): TaggedRecommendation[] {
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...recs].sort((a, b) => {
    // 1. Priority
    const pa = priorityOrder[a.priority] ?? 99;
    const pb = priorityOrder[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    // 2. Category (alphabetical)
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    // 3. Metric name (alphabetical)
    if (a.metric !== b.metric) return a.metric.localeCompare(b.metric);
    // 4. Message (alphabetical tie-break)
    return a.message.localeCompare(b.message);
  });
}

/**
 * Get the full sorted, deduplicated recommendation list.
 * @param score The ACEScore to extract recommendations from.
 * @returns Sorted, deduplicated TaggedRecommendation array.
 */
export function getSortedRecommendations(score: ACEScore): TaggedRecommendation[] {
  const collected = collectAllRecommendations(score);
  const deduped = deduplicateRecommendations(collected);
  return sortRecommendations(deduped);
}

/**
 * Select the top N recommendations deterministically.
 * Selection criteria (in order):
 * 1. priority (high → medium → low)
 * 2. confidence impact (higher = more important — derived from metric confidence)
 * 3. affected metrics (more affected = higher priority)
 * 4. alphabetical tie-break
 *
 * @param score The ACEScore to extract recommendations from.
 * @param n Number of top recommendations to return (default 5).
 * @returns Top N recommendations as plain Recommendation objects (without metric tag).
 */
export function getTopRecommendations(score: ACEScore, n: number = 5): Recommendation[] {
  const sorted = getSortedRecommendations(score);

  // Build a confidence map for tie-breaking by confidence impact
  const metricConfidence: Record<string, number | null> = {};
  for (const key of METRIC_KEYS) {
    const m = score.metrics[key as keyof typeof score.metrics];
    metricConfidence[key] = m?.confidence ?? null;
  }

  // Build affected-metrics count per recommendation (by dedup key)
  const affectedCount = new Map<string, number>();
  for (const r of sorted) {
    const dedupKey = `${r.category}|${r.message}`;
    affectedCount.set(dedupKey, (affectedCount.get(dedupKey) ?? 0) + 1);
  }

  // Re-sort with confidence impact and affected count as secondary criteria
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const reSorted = [...sorted].sort((a, b) => {
    // 1. Priority
    const pa = priorityOrder[a.priority] ?? 99;
    const pb = priorityOrder[b.priority] ?? 99;
    if (pa !== pb) return pa - pb;
    // 2. Confidence impact (lower confidence = higher impact needed)
    const ca = metricConfidence[a.metric] ?? 1;
    const cb = metricConfidence[b.metric] ?? 1;
    if (ca !== cb) return ca - cb; // lower confidence first
    // 3. Affected metrics count (more = higher priority)
    const aKey = `${a.category}|${a.message}`;
    const bKey = `${b.category}|${b.message}`;
    const ac = affectedCount.get(aKey) ?? 1;
    const bc = affectedCount.get(bKey) ?? 1;
    if (ac !== bc) return bc - ac; // more affected first
    // 4. Alphabetical tie-break
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.message.localeCompare(b.message);
  });

  // Strip the metric tag and return as plain Recommendation
  return reSorted.slice(0, n).map((r) => ({
    id: r.id,
    category: r.category,
    priority: r.priority,
    message: r.message,
  }));
}
