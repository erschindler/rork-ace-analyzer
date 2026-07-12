/**
 * Accessibility Extractor — Phase 2
 * Extracts ARIA attributes, alt text, landmark roles, and accessibility signals.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** ARIA landmark roles. */
const LANDMARK_ROLES = [
  "banner", "navigation", "main", "contentinfo",
  "complementary", "search", "form", "region",
];

/**
 * Extract accessibility evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing accessibility signals.
 */
export function extractAccessibility(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let imagesWithoutAlt = 0;
  let totalImages = 0;
  let landmarkCount = 0;
  let ariaLabelCount = 0;

  // Images and alt text
  const images = doc.querySelectorAll("img");
  totalImages = images.length;
  images.forEach((img) => {
    const hasAlt = img.hasAttribute("alt");
    const alt = img.getAttribute("alt") ?? "";
    if (!hasAlt) {
      imagesWithoutAlt++;
      signals.push({
        type: "img_missing_alt",
        value: truncateText(img.getAttribute("src") ?? "unknown image", 200),
        confidence: 0.9,
        selector: generateSelector(img),
        metadata: { issue: "missing_alt", src: img.getAttribute("src") ?? "" },
      });
    } else if (alt.trim()) {
      signals.push({
        type: "img_alt",
        value: truncateText(alt, 200),
        confidence: 0.85,
        selector: generateSelector(img),
        metadata: { alt, src: img.getAttribute("src") ?? "" },
      });
    }
  });

  // ARIA landmarks
  const roleElements = doc.querySelectorAll("[role]");
  roleElements.forEach((el) => {
    const role = el.getAttribute("role") ?? "";
    if (LANDMARK_ROLES.includes(role)) {
      landmarkCount++;
      signals.push({
        type: "aria_landmark",
        value: role,
        confidence: 0.9,
        selector: generateSelector(el),
        metadata: { role, tag: el.tagName.toLowerCase() },
      });
    }
  });

  // Semantic landmarks (header, nav, main, footer, aside, section, article)
  const semanticLandmarks = doc.querySelectorAll("header, nav, main, footer, aside, section, article");
  semanticLandmarks.forEach((el) => {
    signals.push({
      type: "semantic_landmark",
      value: el.tagName.toLowerCase(),
      confidence: 0.85,
      selector: generateSelector(el),
      metadata: { tag: el.tagName.toLowerCase() },
    });
  });

  // aria-label, aria-labelledby, aria-describedby
  const ariaLabelEls = doc.querySelectorAll("[aria-label], [aria-labelledby], [aria-describedby]");
  ariaLabelCount = ariaLabelEls.length;
  ariaLabelEls.forEach((el) => {
    const ariaLabel = el.getAttribute("aria-label");
    if (ariaLabel) {
      signals.push({
        type: "aria_label",
        value: truncateText(ariaLabel, 200),
        confidence: 0.8,
        selector: generateSelector(el),
        metadata: { ariaLabel },
      });
    }
  });

  // Skip links
  const skipLinks = doc.querySelectorAll('a[href^="#"][class*="skip"], a[href^="#skip"]');
  skipLinks.forEach((link) => {
    signals.push({
      type: "skip_link",
      value: link.textContent?.trim() ?? "skip link",
      confidence: 0.9,
      selector: generateSelector(link),
    });
  });

  // Form labels
  const inputs = doc.querySelectorAll("input, select, textarea");
  let inputsWithoutLabel = 0;
  inputs.forEach((input) => {
    const hasLabel = input.getAttribute("aria-label") ||
      input.getAttribute("aria-labelledby") ||
      doc.querySelector(`label[for="${input.getAttribute("id")}"]`);
    if (!hasLabel) inputsWithoutLabel++;
  });
  if (inputsWithoutLabel > 0) {
    signals.push({
      type: "inputs_without_label",
      value: `${inputsWithoutLabel} form inputs without labels`,
      confidence: 0.9,
      selector: "form",
      metadata: { count: inputsWithoutLabel },
    });
  }

  const section: EvidenceSection = {
    category: "accessibility",
    label: "Accessibility Signals",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalImages,
      imagesWithoutAlt,
      landmarkCount,
      ariaLabelCount,
      inputsWithoutLabel,
      hasSkipLinks: skipLinks.length > 0,
    },
  };

  return [section];
}
