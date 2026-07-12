/**
 * Absence Detector — Phase 2
 * Detects missing elements that should be present for AI comprehension.
 * Generates absence evidence for each missing critical element.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";

/** Critical elements that should be present for AI comprehension. */
const CRITICAL_ELEMENTS = [
  { selector: "title", label: "Page title", category: "title" },
  { selector: 'meta[name="description"]', label: "Meta description", category: "meta_description" },
  { selector: "h1", label: "Primary heading (h1)", category: "h1" },
  { selector: "main", label: "Main content landmark", category: "main_landmark" },
  { selector: "nav", label: "Navigation landmark", category: "nav_landmark" },
  { selector: "article", label: "Article content", category: "article" },
  { selector: 'script[type="application/ld+json"]', label: "JSON-LD structured data", category: "json_ld" },
  { selector: 'meta[property="og:title"]', label: "Open Graph title", category: "og_title" },
  { selector: 'meta[property="og:description"]', label: "Open Graph description", category: "og_description" },
  { selector: 'meta[property="og:image"]', label: "Open Graph image", category: "og_image" },
  { selector: 'link[rel="canonical"]', label: "Canonical URL", category: "canonical" },
  { selector: "img[alt]", label: "Images with alt text", category: "img_alt" },
  { selector: "section", label: "Semantic sections", category: "section" },
  { selector: "header", label: "Header landmark", category: "header_landmark" },
  { selector: "footer", label: "Footer landmark", category: "footer_landmark" },
  { selector: 'html[lang]', label: "Language declaration", category: "language" },
  { selector: 'meta[name="viewport"]', label: "Viewport meta tag", category: "viewport" },
  { selector: "time", label: "Time elements", category: "time" },
  { selector: 'meta[name="robots"]', label: "Robots meta tag", category: "robots" },
];

/**
 * Detect absence of critical elements in a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing absence signals.
 */
export function detectAbsence(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const missing: string[] = [];

  for (const critical of CRITICAL_ELEMENTS) {
    const found = doc.querySelector(critical.selector);
    if (!found) {
      missing.push(critical.category);
      signals.push({
        type: "absence",
        value: `Missing: ${critical.label}`,
        confidence: 1.0,
        selector: critical.selector,
        metadata: {
          category: critical.category,
          label: critical.label,
          severity: getAbsenceSeverity(critical.category),
        },
      });
    }
  }

  // Check for empty critical elements
  const h1 = doc.querySelector("h1");
  if (h1 && !h1.textContent?.trim()) {
    signals.push({
      type: "absence",
      value: "Empty h1 element found",
      confidence: 0.9,
      selector: "h1",
      metadata: { category: "empty_h1", severity: "warning" },
    });
  }

  const metaDesc = doc.querySelector('meta[name="description"]');
  if (metaDesc && !metaDesc.getAttribute("content")?.trim()) {
    signals.push({
      type: "absence",
      value: "Empty meta description found",
      confidence: 0.9,
      selector: 'meta[name="description"]',
      metadata: { category: "empty_meta_description", severity: "warning" },
    });
  }

  // Check for content absence (very little text)
  const body = doc.body;
  if (body) {
    const text = body.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length > 0 && text.length < 100) {
      signals.push({
        type: "absence",
        value: `Minimal content detected (${text.length} chars)`,
        confidence: 0.85,
        selector: "body",
        metadata: { category: "minimal_content", textLength: text.length, severity: "warning" },
      });
    }
  }

  const section: EvidenceSection = {
    category: "absence",
    label: "Absence Evidence",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 1.0 : 0,
    metadata: {
      missingCount: missing.length,
      missingCategories: missing,
      criticalMissing: missing.filter((m) => ["title", "h1", "meta_description", "main_landmark", "json_ld"].includes(m)),
    },
  };

  return [section];
}

/**
 * Get severity for an absence category.
 * @internal
 */
function getAbsenceSeverity(category: string): "info" | "warning" | "critical" {
  const critical = ["title", "h1", "meta_description", "main_landmark"];
  const warning = ["json_ld", "og_title", "og_description", "canonical", "language", "article"];

  if (critical.includes(category)) return "critical";
  if (warning.includes(category)) return "warning";
  return "info";
}
