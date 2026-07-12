/**
 * Weighting Engine — Phase 4 (ACE v1.2)
 * Default weighting profile, custom profile validation, normalization,
 * and null-metric weight renormalization.
 */

import type { WeightingProfile } from "@/types";

/** Default ACE v1.2 weighting profile. Weights sum to exactly 1.00. */
export const DEFAULT_WEIGHTS: WeightingProfile = {
  readability: 0.06,
  structure: 0.06,
  clarity: 0.05,
  consistency: 0.05,
  semantic: 0.06,
  completeness: 0.06,
  semanticStructure: 0.10,
  structuredData: 0.08,
  extractability: 0.10,
  accessibility: 0.08,
  entityRecognition: 0.10,
  machineComprehension: 0.20,
};

/** All weight keys in deterministic order. */
export const WEIGHT_KEYS = [
  "readability",
  "structure",
  "clarity",
  "consistency",
  "semantic",
  "completeness",
  "semanticStructure",
  "structuredData",
  "extractability",
  "accessibility",
  "entityRecognition",
  "machineComprehension",
] as const;

/** Expected sum of all weights. */
export const EXPECTED_WEIGHT_SUM = 1.0;

/** Tolerance for weight sum validation. */
const WEIGHT_TOLERANCE = 0.001;

/**
 * Validate a weighting profile.
 * @param profile The profile to validate.
 * @returns True if valid (all keys present, all >= 0, sum ≈ 1.0).
 */
export function validateWeightingProfile(profile: Partial<WeightingProfile>): boolean {
  // Check all keys exist and are non-negative numbers
  for (const key of WEIGHT_KEYS) {
    const val = profile[key];
    if (typeof val !== "number" || Number.isNaN(val) || val < 0) {
      return false;
    }
  }

  // Check sum is approximately 1.0
  const sum = sumWeights(profile as WeightingProfile);
  if (Math.abs(sum - EXPECTED_WEIGHT_SUM) > WEIGHT_TOLERANCE) {
    return false;
  }

  return true;
}

/**
 * Normalize a weighting profile so weights sum to exactly 1.0.
 * @param profile The profile to normalize.
 * @returns Normalized profile.
 */
export function normalizeWeightingProfile(profile: Partial<WeightingProfile>): WeightingProfile {
  // Fill missing keys with default values
  const filled: WeightingProfile = { ...DEFAULT_WEIGHTS, ...profile } as WeightingProfile;

  const sum = sumWeights(filled);
  if (sum <= 0) {
    return { ...DEFAULT_WEIGHTS };
  }

  // Scale all weights so they sum to 1.0
  const factor = EXPECTED_WEIGHT_SUM / sum;
  const normalized = {} as WeightingProfile;
  for (const key of WEIGHT_KEYS) {
    normalized[key] = Math.round(filled[key] * factor * 100000) / 100000;
  }

  // Fix rounding drift by adjusting the largest weight
  const drift = EXPECTED_WEIGHT_SUM - sumWeights(normalized);
  if (Math.abs(drift) > 0.00001) {
    const largestKey = WEIGHT_KEYS.reduce((max, key) =>
      normalized[key] > normalized[max] ? key : max,
    );
    normalized[largestKey] = Math.round((normalized[largestKey] + drift) * 100000) / 100000;
  }

  return normalized;
}

/**
 * Get a valid weighting profile, falling back to default if invalid.
 * @param profile Custom profile to try.
 * @returns Valid weighting profile (custom if valid, default otherwise).
 */
export function getValidWeightingProfile(profile?: Partial<WeightingProfile>): WeightingProfile {
  if (!profile) return { ...DEFAULT_WEIGHTS };
  if (validateWeightingProfile(profile)) return profile as WeightingProfile;

  // Try to normalize; if that produces a valid profile, use it
  const normalized = normalizeWeightingProfile(profile);
  if (validateWeightingProfile(normalized)) return normalized;

  return { ...DEFAULT_WEIGHTS };
}

/**
 * Renormalize weights for non-null metrics.
 * When some metrics have score === null, their weights are redistributed
 * proportionally to the remaining metrics.
 * @param profile Original weighting profile.
 * @param nullMetrics Set of metric keys that have null scores.
 * @returns Renormalized profile where non-null weights sum to 1.0.
 */
export function renormalizeForNullMetrics(
  profile: WeightingProfile,
  nullMetrics: Set<string>,
): WeightingProfile {
  if (nullMetrics.size === 0) return { ...profile };
  if (nullMetrics.size === WEIGHT_KEYS.length) return { ...profile };

  // Calculate the total weight of non-null metrics
  let activeWeightSum = 0;
  for (const key of WEIGHT_KEYS) {
    if (!nullMetrics.has(key)) {
      activeWeightSum += profile[key];
    }
  }

  if (activeWeightSum <= 0) return { ...profile };

  // Redistribute null metric weights proportionally
  const result = {} as WeightingProfile;
  const factor = EXPECTED_WEIGHT_SUM / activeWeightSum;
  for (const key of WEIGHT_KEYS) {
    if (nullMetrics.has(key)) {
      result[key] = 0;
    } else {
      result[key] = Math.round(profile[key] * factor * 100000) / 100000;
    }
  }

  // Fix rounding drift
  const drift = EXPECTED_WEIGHT_SUM - sumWeights(result);
  if (Math.abs(drift) > 0.00001) {
    // Find the largest non-null weight and adjust
    let largestKey: typeof WEIGHT_KEYS[number] = "machineComprehension";
    let largestVal = 0;
    for (const key of WEIGHT_KEYS) {
      if (!nullMetrics.has(key) && result[key] > largestVal) {
        largestVal = result[key];
        largestKey = key;
      }
    }
    result[largestKey] = Math.round((result[largestKey] + drift) * 100000) / 100000;
  }

  return result;
}

/**
 * Sum all weights in a profile.
 * @param profile Weighting profile.
 * @returns Sum of all weights.
 */
function sumWeights(profile: WeightingProfile): number {
  let sum = 0;
  for (const key of WEIGHT_KEYS) {
    sum += profile[key];
  }
  return Math.round(sum * 100000) / 100000;
}
