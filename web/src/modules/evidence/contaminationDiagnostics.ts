/**
 * Contamination Diagnostics — Phase 2/3
 * Central module that records all contamination and failure-mode diagnostics
 * across the ACE pipeline.
 *
 * Used by Phase 2 (fetcher, domParser, contaminationDetector, evidenceLayer)
 * and Phase 3 (normalizationLayer) to record and propagate contamination info.
 */

import type {
  ContaminationDiagnosticRecord,
  ContaminationDiagnosticsSummary,
} from "@/types";

/** Re-export the types for convenience. */
export type { ContaminationDiagnosticRecord, ContaminationDiagnosticsSummary };

/** Collector for contamination diagnostics across pipeline phases. */
export interface ContaminationDiagnosticsCollector {
  /** Record a fetch failure reason. */
  recordFetchFailure(reason: string, detail?: Record<string, unknown>): void;
  /** Record a DOM corruption reason. */
  recordDomCorruption(reason: string, detail?: Record<string, unknown>): void;
  /** Record hydration shell detection. */
  recordHydrationShell(detail?: Record<string, unknown>): void;
  /** Record script-only DOM detection. */
  recordScriptOnlyDom(detail?: Record<string, unknown>): void;
  /** Record shadow DOM detection. */
  recordShadowDom(detail?: Record<string, unknown>): void;
  /** Record boilerplate detection. */
  recordBoilerplate(detail?: Record<string, unknown>): void;
  /** Record parser errors. */
  recordParserErrors(errors: string[], detail?: Record<string, unknown>): void;
  /** Record encoding failure. */
  recordEncodingFailure(detail?: Record<string, unknown>): void;
  /** Record a generic contamination. */
  recordContamination(
    source: ContaminationDiagnosticRecord["source"],
    type: string,
    reason: string,
    severity: "critical" | "warning" | "info",
    blocksScoring: boolean,
    detail?: Record<string, unknown>,
  ): void;
  /** Get all recorded diagnostics. */
  getRecords(): ContaminationDiagnosticRecord[];
  /** Whether any critical contamination that blocks scoring was detected. */
  hasBlockingContamination(): boolean;
  /** Get the primary contamination type (first critical, or first overall). */
  getPrimaryType(): string | undefined;
  /** Get all contamination flags as an array of type strings. */
  getFlags(): string[];
  /** Build a serializable summary. */
  build(): ContaminationDiagnosticsSummary;
}

/**
 * Create a contamination diagnostics collector.
 * @returns A new collector instance.
 */
export function createContaminationDiagnostics(): ContaminationDiagnosticsCollector {
  const records: ContaminationDiagnosticRecord[] = [];

  function add(record: ContaminationDiagnosticRecord): void {
    const exists = records.some(
      (r) => r.source === record.source && r.type === record.type,
    );
    if (!exists) {
      records.push(record);
    }
  }

  return {
    recordFetchFailure(reason: string, detail?: Record<string, unknown>) {
      add({
        source: "fetcher",
        type: "fetch_failure",
        reason,
        severity: "critical",
        blocksScoring: true,
        detail,
      });
    },

    recordDomCorruption(reason: string, detail?: Record<string, unknown>) {
      add({
        source: "dom_parser",
        type: "dom_corruption",
        reason,
        severity: "critical",
        blocksScoring: true,
        detail,
      });
    },

    recordHydrationShell(detail?: Record<string, unknown>) {
      add({
        source: "contamination_detector",
        type: "hydration_shell",
        reason: "SPA without server-rendered content — evidence extraction is limited",
        severity: "critical",
        blocksScoring: true,
        detail,
      });
    },

    recordScriptOnlyDom(detail?: Record<string, unknown>) {
      add({
        source: "contamination_detector",
        type: "script_only_dom",
        reason: "Body contains only script tags — no visible content for analysis",
        severity: "critical",
        blocksScoring: true,
        detail,
      });
    },

    recordShadowDom(detail?: Record<string, unknown>) {
      add({
        source: "contamination_detector",
        type: "shadow_dom",
        reason: "Custom elements with shadow DOM — content not accessible to standard DOM queries",
        severity: "warning",
        blocksScoring: false,
        detail,
      });
    },

    recordBoilerplate(detail?: Record<string, unknown>) {
      add({
        source: "contamination_detector",
        type: "boilerplate_only",
        reason: "Page dominated by cookie banners or auth walls — limited content evidence",
        severity: "warning",
        blocksScoring: false,
        detail,
      });
    },

    recordParserErrors(errors: string[], detail?: Record<string, unknown>) {
      if (errors.length === 0) return;
      add({
        source: "dom_parser",
        type: "parser_error",
        reason: `${errors.length} parser error(s): ${errors[0]?.substring(0, 200) ?? "unknown"}`,
        severity: "warning",
        blocksScoring: false,
        detail: { errors, ...detail },
      });
    },

    recordEncodingFailure(detail?: Record<string, unknown>) {
      add({
        source: "contamination_detector",
        type: "encoding_failure",
        reason: "Character encoding issues — some text may be garbled",
        severity: "warning",
        blocksScoring: false,
        detail,
      });
    },

    recordContamination(
      source: ContaminationDiagnosticRecord["source"],
      type: string,
      reason: string,
      severity: "critical" | "warning" | "info",
      blocksScoring: boolean,
      detail?: Record<string, unknown>,
    ) {
      add({ source, type, reason, severity, blocksScoring, detail });
    },

    getRecords() {
      return [...records];
    },

    hasBlockingContamination() {
      return records.some((r) => r.blocksScoring);
    },

    getPrimaryType() {
      const blocking = records.find((r) => r.blocksScoring);
      if (blocking) return blocking.type;
      return records[0]?.type;
    },

    getFlags() {
      return [...new Set(records.map((r) => r.type))];
    },

    build(): ContaminationDiagnosticsSummary {
      const fetchFailure = records.find((r) => r.type === "fetch_failure");
      const domCorruption = records.find((r) => r.type === "dom_corruption");
      const parserErrorRec = records.find((r) => r.type === "parser_error");
      const flags = [...new Set(records.map((r) => r.type))];

      return {
        hasContamination: records.length > 0,
        hasBlockingContamination: records.some((r) => r.blocksScoring),
        primaryType: this.getPrimaryType(),
        flags,
        records: [...records],
        fetchFailureReason: fetchFailure?.reason,
        domCorruptionReason: domCorruption?.reason,
        hydrationShellDetected: records.some((r) => r.type === "hydration_shell"),
        scriptOnlyDomDetected: records.some((r) => r.type === "script_only_dom"),
        shadowDomDetected: records.some((r) => r.type === "shadow_dom"),
        boilerplateDetected: records.some((r) => r.type === "boilerplate_only"),
        parserErrors: (parserErrorRec?.detail?.errors as string[]) ?? [],
        encodingFailureDetected: records.some((r) => r.type === "encoding_failure"),
      };
    },
  };
}
