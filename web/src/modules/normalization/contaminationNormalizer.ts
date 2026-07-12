/**
 * Contamination Normalizer — Phase 3
 * Normalizes contamination metadata: contamination flags, contamination_type,
 * failure-mode signals, and normalization warnings.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";

/** Contamination type severity mapping. */
const CONTAMINATION_SEVERITY: Record<string, "critical" | "warning" | "info"> = {
  hydration_shell: "critical",
  script_only_dom: "critical",
  shadow_dom: "warning",
  malformed_dom: "warning",
  boilerplate_only: "warning",
  oversized_html: "warning",
  encoding_failure: "warning",
  fetch_failure: "critical",
  parser_error: "warning",
  missing_main_content: "warning",
  truncated_html: "warning",
  dom_corruption: "critical",
  cors_proxy_fallback: "info",
  cors_block: "info",
  invalid_url: "critical",
  unsupported_protocol: "critical",
};

/** Contamination type human-readable descriptions. */
const CONTAMINATION_DESCRIPTIONS: Record<string, string> = {
  hydration_shell: "SPA without server-rendered content — evidence extraction is limited",
  script_only_dom: "Body contains only script tags — no visible content for analysis",
  shadow_dom: "Custom elements with shadow DOM — content not accessible to standard DOM queries",
  malformed_dom: "HTML has structural issues — fallback DOM was used",
  boilerplate_only: "Page dominated by cookie banners or auth walls — limited content evidence",
  oversized_html: "HTML exceeds size limit — content may be truncated",
  encoding_failure: "Character encoding issues — some text may be garbled",
  fetch_failure: "HTTP fetch failed — no content available for analysis",
  parser_error: "HTML parser encountered errors — DOM may be incomplete",
  missing_main_content: "No main content area detected — extractability is degraded",
  truncated_html: "HTML appears truncated — content may be incomplete",
};

/**
 * Normalize contamination metadata from the evidence result.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized contamination sections and metadata.
 */
export function normalizeContamination(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): {
  sections: NormalizedSection[];
  contaminationType: string | undefined;
  contaminationFlags: string[];
  warnings: string[];
} {
  const flags = evidence.contaminationFlags ?? [];
  const warnings: string[] = [];

  // Build contamination sections from absence signals that are contamination type
  const contaminationSignals: NormalizedSignal[] = [];

  // Process contamination flags
  for (const flag of flags) {
    const severity = CONTAMINATION_SEVERITY[flag] ?? "warning";
    const description = CONTAMINATION_DESCRIPTIONS[flag] ?? `Contamination: ${flag}`;

    contaminationSignals.push({
      type: "contamination",
      value: `${flag}: ${description}`,
      confidence: severity === "critical" ? 1.0 : 0.85,
      selector: "html",
      metadata: {
        contaminationType: flag,
        severity,
        description,
        category: "contamination",
      },
      isContaminated: true,
    });

    warnings.push(`Contamination detected: ${flag} — ${description}`);
  }

  // Check diagnostics for additional contamination signals
  const diag = evidence.diagnostics;
  if (diag) {
    if (diag.fetchError) {
      warnings.push(`Fetch error: ${diag.fetchError}`);
    }
    if (diag.parseErrors && diag.parseErrors.length > 0) {
      warnings.push(`Parse errors: ${diag.parseErrors.length} errors detected`);
    }
    if (!diag.mainContentFound) {
      warnings.push("Main content not found — extractability may be degraded");
    }
    if (diag.visibleTextLength < 50) {
      warnings.push(`Very low visible text content (${diag.visibleTextLength} chars)`);
    }
  }

  // Create normalized contamination section
  const section: NormalizedSection = {
    id: "contamination_0",
    type: "contamination",
    normalizedContent: contaminationSignals.map((s) => s.value).join("; "),
    normalizedSignals: contaminationSignals,
    sourceSectionId: "contamination",
    originalCount: flags.length,
    duplicatesRemoved: 0,
    confidence: isContaminated ? 1.0 : 0,
  };

  // Add contamination summary signal
  const criticalFlags = flags.filter((f) => CONTAMINATION_SEVERITY[f] === "critical");
  const warningFlags = flags.filter((f) => CONTAMINATION_SEVERITY[f] === "warning");

  section.normalizedSignals.push({
    type: "contamination_summary",
    value: isContaminated
      ? `${flags.length} contamination flags (${criticalFlags.length} critical, ${warningFlags.length} warning)`
      : "No contamination detected",
    confidence: 1.0,
    selector: "html",
    metadata: {
      isContaminated,
      contaminationType: evidence.contaminationType,
      totalFlags: flags.length,
      criticalFlags,
      warningFlags,
      hasCriticalContamination: criticalFlags.length > 0,
    },
    isContaminated,
  });

  return {
    sections: [section],
    contaminationType: evidence.contaminationType,
    contaminationFlags: flags,
    warnings,
  };
}

/**
 * Check if evidence is severely contaminated (critical contamination type).
 * @param contaminationType The contamination type string.
 * @returns True if contamination is critical severity.
 */
export function isCriticalContamination(contaminationType?: string): boolean {
  if (!contaminationType) return false;
  return CONTAMINATION_SEVERITY[contaminationType] === "critical";
}

/**
 * Get contamination severity for a contamination type.
 * @param contaminationType Contamination type identifier.
 * @returns Severity level.
 */
export function getContaminationSeverity(contaminationType: string): "critical" | "warning" | "info" {
  return CONTAMINATION_SEVERITY[contaminationType] ?? "warning";
}
