/**
 * Contamination Detector — Phase 2
 * Detects DOM contamination: hydration shells, script-only DOMs, shadow DOM,
 * boilerplate-only pages, oversized HTML, encoding failures, malformed DOM.
 * Records all detections into a ContaminationDiagnosticsCollector.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import type { ContaminationDiagnosticsCollector } from "./contaminationDiagnostics";
import {
  detectHydrationShell,
  detectShadowDom,
  detectMalformedDom,
  detectScriptOnlyDom,
  detectBoilerplateDom,
  detectOversizedHtml,
  detectEncodingFailure,
} from "./domParser";

/**
 * Detect all contamination types in a Document and HTML string.
 * Records findings into the provided diagnostics collector.
 * @param doc Parsed Document.
 * @param html Raw HTML string.
 * @param collector Optional contamination diagnostics collector.
 * @returns EvidenceSection[] and contamination flags.
 */
export function detectContamination(
  doc: Document,
  html: string,
  collector?: ContaminationDiagnosticsCollector,
): { sections: EvidenceSection[]; flags: string[]; contaminationType?: string } {
  const signals: EvidenceSignal[] = [];
  const flags: string[] = [];

  // Hydration shell
  if (detectHydrationShell(doc)) {
    flags.push("hydration_shell");
    signals.push({
      type: "contamination",
      value: "Hydration shell detected — SPA without rendered content",
      confidence: 1.0,
      selector: "body",
      metadata: {
        contaminationType: "hydration_shell",
        description: "The page appears to be a client-side rendered SPA with no server-rendered content. Evidence extraction will be limited.",
        severity: "critical",
      },
    });
    collector?.recordHydrationShell({ htmlSize: html.length });
  }

  // Shadow DOM
  if (detectShadowDom(doc)) {
    flags.push("shadow_dom");
    signals.push({
      type: "contamination",
      value: "Shadow DOM detected — content hidden inside shadow roots",
      confidence: 0.9,
      selector: "body",
      metadata: {
        contaminationType: "shadow_dom",
        description: "Custom elements with shadow DOM detected. Content inside shadow roots is not accessible to standard DOM queries.",
        severity: "warning",
      },
    });
    collector?.recordShadowDom();
  }

  // Malformed DOM
  if (detectMalformedDom(doc)) {
    flags.push("malformed_dom");
    signals.push({
      type: "contamination",
      value: "Malformed DOM detected — parser errors or missing structure",
      confidence: 0.9,
      selector: "html",
      metadata: {
        contaminationType: "malformed_dom",
        description: "The HTML has structural issues (missing body/head, parser errors, or unclosed tags). Fallback DOM was used.",
        severity: "warning",
      },
    });
    collector?.recordContamination(
      "contamination_detector",
      "malformed_dom",
      "HTML has structural issues — fallback DOM was used",
      "warning",
      false,
    );
  }

  // Script-only DOM
  if (detectScriptOnlyDom(doc)) {
    flags.push("script_only_dom");
    signals.push({
      type: "contamination",
      value: "Script-only DOM detected — no visible content",
      confidence: 1.0,
      selector: "body",
      metadata: {
        contaminationType: "script_only_dom",
        description: "The body contains only script tags with no visible text content.",
        severity: "critical",
      },
    });
    collector?.recordScriptOnlyDom();
  }

  // Boilerplate-only
  if (detectBoilerplateDom(doc)) {
    flags.push("boilerplate_only");
    signals.push({
      type: "contamination",
      value: "Boilerplate-only page detected — cookie banners, GDPR overlays, or login walls",
      confidence: 0.85,
      selector: "body",
      metadata: {
        contaminationType: "boilerplate_only",
        description: "The page content is dominated by cookie banners, consent overlays, or authentication walls.",
        severity: "warning",
      },
    });
    collector?.recordBoilerplate();
  }

  // Oversized HTML
  if (detectOversizedHtml(html)) {
    flags.push("oversized_html");
    signals.push({
      type: "contamination",
      value: "Oversized HTML detected — content may be truncated",
      confidence: 0.9,
      selector: "html",
      metadata: {
        contaminationType: "oversized_html",
        htmlSize: html.length,
        description: "The HTML exceeds the size limit. Content may have been truncated for processing.",
        severity: "warning",
      },
    });
    collector?.recordContamination(
      "contamination_detector",
      "oversized_html",
      `HTML exceeds size limit (${html.length} bytes)`,
      "warning",
      false,
      { htmlSize: html.length },
    );
  }

  // Encoding failure
  if (detectEncodingFailure(html)) {
    flags.push("encoding_failure");
    signals.push({
      type: "contamination",
      value: "Encoding failure detected — non-UTF8 or corrupted characters",
      confidence: 0.85,
      selector: "html",
      metadata: {
        contaminationType: "encoding_failure",
        description: "Character encoding issues detected. Some text may be garbled or corrupted.",
        severity: "warning",
      },
    });
    collector?.recordEncodingFailure();
  }

  // Determine primary contamination type
  const contaminationType = flags.length > 0 ? flags[0] : undefined;

  const section: EvidenceSection = {
    category: "contamination",
    label: "Contamination Flags",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 1.0 : 0,
    metadata: {
      isContaminated: flags.length > 0,
      contaminationFlags: flags,
      primaryType: contaminationType,
    },
  };

  return { sections: [section], flags, contaminationType };
}
