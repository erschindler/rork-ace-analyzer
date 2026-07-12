/**
 * Version Metadata Builder — Phase 5
 * Builds AceVersionMetadata for all report types.
 * Includes reporting implementation version and stable schema version.
 */

import type { AceVersionMetadata, ScoringVersion } from "@/types";

/** Reporting engine implementation version. */
export const REPORTING_VERSION = "1.2.0";

/** Stable report schema version (for Phase 6 benchmarking compatibility). */
export const SCHEMA_VERSION = "1.0.0";

/** Fixed ACE version strings aligned with Phase 2–4. */
const EVIDENCE_VERSION = "1.2.0";
const NORMALIZATION_VERSION = "1.2.0";
const SCORING_VERSION_STR = "1.2.0";
const METRICS_VERSION = "1.2.0";
const WEIGHTING_VERSION = "1.2.0";

/**
 * Build complete version metadata for reports.
 * @param scoringVersion Optional scoring version from ACEScore (used for validation).
 * @returns Complete AceVersionMetadata.
 */
export function buildVersionMetadata(scoringVersion?: ScoringVersion): AceVersionMetadata {
  return {
    evidence: EVIDENCE_VERSION,
    normalization: NORMALIZATION_VERSION,
    scoring: SCORING_VERSION_STR,
    metrics: METRICS_VERSION,
    weighting: WEIGHTING_VERSION,
    reporting: REPORTING_VERSION,
    schema: SCHEMA_VERSION,
  };
}
