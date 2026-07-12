/**
 * Contamination Report Builder — Phase 5
 * Converts contamination metadata into readable diagnostics and explains impact.
 *
 * Does NOT recompute contamination — only transforms the representation.
 */

import type { ACEScore, NormalizedEvidenceResult } from "@/types";

/** Contamination severity levels. */
type ContaminationSeverity = "critical" | "warning" | "info";

/** Mapping of contamination types to severity. */
const CONTAMINATION_SEVERITY: Record<string, ContaminationSeverity> = {
  hydration_shell: "critical",
  script_only_dom: "critical",
  fetch_failure: "critical",
  shadow_dom: "warning",
  boilerplate_only: "warning",
  malformed_dom: "warning",
  truncated_html: "warning",
  encoding_failure: "info",
  oversized_html: "info",
};

/** Human-readable descriptions for contamination types. */
const CONTAMINATION_DESCRIPTIONS: Record<string, string> = {
  hydration_shell: "Page contains a client-side rendering shell with minimal server-rendered content. Evidence extraction may capture scaffold HTML rather than real content.",
  script_only_dom: "DOM is primarily populated by JavaScript execution. Static analysis captures little or no visible content.",
  fetch_failure: "HTTP fetch failed or returned an error status. Evidence extraction could not retrieve the page.",
  shadow_dom: "Shadow DOM elements detected. Content inside shadow roots may not be captured by standard selectors.",
  boilerplate_only: "Page contains mostly boilerplate content (navigation, footer, scripts) with minimal substantive content.",
  malformed_dom: "DOM parsing encountered errors. Evidence may be incomplete or incorrectly structured.",
  truncated_html: "HTML was truncated during fetch. Evidence may be missing content from the end of the document.",
  encoding_failure: "Character encoding detection failed. Text content may contain garbled or incorrectly decoded characters.",
  oversized_html: "HTML exceeds recommended size limits. Performance and extraction may be affected.",
};

/** Impact descriptions for contamination types. */
const CONTAMINATION_IMPACT: Record<string, string> = {
  hydration_shell: "Critical: Scoring may reflect empty or scaffold content rather than the actual page. Scores may be artificially low or flagged as absence-dominated.",
  script_only_dom: "Critical: Content not available to static analysis. Multiple metrics will have insufficient evidence.",
  fetch_failure: "Critical: No evidence could be extracted. The result will be insufficient evidence.",
  shadow_dom: "Warning: Some content within shadow roots may be missed, reducing evidence coverage for semantic and structure metrics.",
  boilerplate_only: "Warning: Content metrics will be penalized. Extractability will flag high noise ratio.",
  malformed_dom: "Warning: Structure and hierarchy metrics may be inaccurate. Some evidence may be missing.",
  truncated_html: "Warning: Content at the end of the page may be missing, affecting completeness.",
  encoding_failure: "Info: Text-based metrics (readability, clarity) may be affected by encoding issues.",
  oversized_html: "Info: Performance may be degraded. No direct scoring impact unless other contamination is present.",
};

/**
 * Build a contamination summary from an ACEScore.
 * @param score The ACEScore with contamination diagnostics.
 * @returns Contamination summary object.
 */
export function buildContaminationSummary(score: ACEScore): {
  hasContamination: boolean;
  type: string | null;
  severity: ContaminationSeverity | null;
  description: string | null;
  impact: string | null;
} {
  if (!score.diagnostics.contamination) {
    return {
      hasContamination: false,
      type: null,
      severity: null,
      description: null,
      impact: null,
    };
  }

  const type = score.diagnostics.contaminationType ?? "unknown";
  const severity = CONTAMINATION_SEVERITY[type] ?? "info";
  const description = CONTAMINATION_DESCRIPTIONS[type] ?? `Unknown contamination type: ${type}`;
  const impact = CONTAMINATION_IMPACT[type] ?? "Impact unknown.";

  return {
    hasContamination: true,
    type,
    severity,
    description,
    impact,
  };
}

/**
 * Get a readable list of contamination flags from normalized evidence.
 * @param normalized The normalized evidence result.
 * @returns Array of contamination flag descriptions.
 */
export function buildContaminationFlagList(normalized: NormalizedEvidenceResult): string[] {
  const flags: string[] = [];

  // Check normalized contamination
  if (normalized.contamination && normalized.contaminationType) {
    flags.push(normalized.contaminationType);
  }

  // Check absence sections for contamination signals
  for (const section of normalized.absence) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "contamination" && sig.metadata?.contaminationType) {
        const flag = sig.metadata.contaminationType as string;
        if (!flags.includes(flag)) {
          flags.push(flag);
        }
      }
    }
  }

  return flags.sort();
}

/**
 * Get contamination impact descriptions for all detected flags.
 * @param normalized The normalized evidence result.
 * @returns Array of { flag, severity, description, impact } objects.
 */
export function buildContaminationImpactList(normalized: NormalizedEvidenceResult): Array<{
  flag: string;
  severity: ContaminationSeverity;
  description: string;
  impact: string;
}> {
  const flags = buildContaminationFlagList(normalized);
  return flags.map((flag) => ({
    flag,
    severity: CONTAMINATION_SEVERITY[flag] ?? "info",
    description: CONTAMINATION_DESCRIPTIONS[flag] ?? `Unknown contamination: ${flag}`,
    impact: CONTAMINATION_IMPACT[flag] ?? "Impact unknown.",
  }));
}
