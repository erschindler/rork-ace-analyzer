/**
 * Absence Normalizer — Phase 3
 * Normalizes absence evidence: standardizes type, reason, expected,
 * unifies absence formats, and propagates absence signals.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText } from "./textNormalizer";

/** Absence severity levels. */
type Severity = "info" | "warning" | "critical";

/** Absence category canonicalization. */
const ABSENCE_CATEGORY_MAP: Record<string, string> = {
  title: "title",
  meta_description: "meta_description",
  h1: "primary_heading",
  main_landmark: "main_landmark",
  nav_landmark: "nav_landmark",
  article: "article_content",
  json_ld: "structured_data",
  og_title: "open_graph_title",
  og_description: "open_graph_description",
  og_image: "open_graph_image",
  canonical: "canonical_url",
  img_alt: "image_alt_text",
  section: "semantic_sections",
  header_landmark: "header_landmark",
  footer_landmark: "footer_landmark",
  language: "language_declaration",
  viewport: "viewport_meta",
  time: "time_elements",
  robots: "robots_meta",
  empty_h1: "empty_primary_heading",
  empty_meta_description: "empty_meta_description",
  minimal_content: "minimal_content",
  fetch_failure: "fetch_failure",
};

/** Expected element description for each absence category. */
const EXPECTED_MAP: Record<string, string> = {
  title: "<title> element in <head>",
  meta_description: '<meta name="description"> tag',
  primary_heading: "<h1> heading element",
  main_landmark: "<main> landmark element",
  nav_landmark: "<nav> navigation landmark",
  article_content: "<article> content element",
  structured_data: '<script type="application/ld+json"> structured data',
  open_graph_title: '<meta property="og:title">',
  open_graph_description: '<meta property="og:description">',
  open_graph_image: '<meta property="og:image">',
  canonical_url: '<link rel="canonical">',
  image_alt_text: "Images with alt attributes",
  semantic_sections: "<section> semantic elements",
  header_landmark: "<header> landmark",
  footer_landmark: "<footer> landmark",
  language_declaration: '<html lang="..."> attribute',
  viewport_meta: '<meta name="viewport">',
  time_elements: "<time> elements",
  robots_meta: '<meta name="robots">',
  empty_primary_heading: "Non-empty <h1> with text content",
  empty_meta_description: '<meta name="description"> with content',
  minimal_content: "Substantial body content (>100 chars)",
  fetch_failure: "Successful HTTP fetch of the target URL",
};

/**
 * Normalize absence evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized absence sections.
 */
export function normalizeAbsence(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.absence) {
    const normalized = normalizeSection(section, "absence", isContaminated);

    const criticalMissing: string[] = [];
    const warningMissing: string[] = [];
    const infoMissing: string[] = [];

    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      const rawCategory = (sig.metadata?.category as string) ?? sig.type;
      const canonicalCategory = ABSENCE_CATEGORY_MAP[rawCategory] ?? rawCategory;
      const severity = (sig.metadata?.severity as Severity) ?? getAbsenceSeverity(canonicalCategory);
      const expected = EXPECTED_MAP[canonicalCategory] ?? `Expected element: ${canonicalCategory}`;
      const reason = normalizeParagraphText(sig.value);

      // Track by severity
      switch (severity) {
        case "critical":
          criticalMissing.push(canonicalCategory);
          break;
        case "warning":
          warningMissing.push(canonicalCategory);
          break;
        default:
          infoMissing.push(canonicalCategory);
      }

      return {
        ...sig,
        value: `Missing: ${canonicalCategory}`,
        confidence: 1.0,
        metadata: {
          ...sig.metadata,
          category: canonicalCategory,
          originalCategory: rawCategory,
          severity,
          expected,
          reason,
          isContaminated,
        },
      };
    });

    // Add absence summary signal
    const totalMissing = criticalMissing.length + warningMissing.length + infoMissing.length;

    normalized.normalizedSignals.push({
      type: "absence_summary",
      value: `${totalMissing} missing elements (${criticalMissing.length} critical, ${warningMissing.length} warning, ${infoMissing.length} info)`,
      confidence: 1.0,
      selector: "body",
      metadata: {
        totalMissing,
        criticalMissing,
        warningMissing,
        infoMissing,
        hasCriticalAbsence: criticalMissing.length > 0,
        contaminationImpact: isContaminated,
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => `[${s.metadata?.severity ?? "info"}] ${s.value}`)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Get severity for an absence category.
 */
function getAbsenceSeverity(category: string): Severity {
  const critical = ["title", "primary_heading", "meta_description", "main_landmark", "fetch_failure"];
  const warning = [
    "structured_data", "open_graph_title", "open_graph_description",
    "canonical_url", "language_declaration", "article_content",
    "empty_primary_heading", "empty_meta_description", "minimal_content",
  ];

  if (critical.includes(category)) return "critical";
  if (warning.includes(category)) return "warning";
  return "info";
}

/**
 * Get critical missing categories from normalized absence sections.
 * @param sections Normalized absence sections.
 * @returns Array of critical missing category names.
 */
export function getCriticalAbsence(sections: NormalizedSection[]): string[] {
  for (const section of sections) {
    for (const sig of section.normalizedSignals) {
      if (sig.type === "absence_summary") {
        return (sig.metadata?.criticalMissing as string[]) ?? [];
      }
    }
  }
  return [];
}
