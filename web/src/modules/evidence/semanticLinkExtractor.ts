/**
 * Semantic Link Extractor — Phase 2
 * Analyzes semantic meaning of links: navigational, informational, promotional, contextual.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Patterns for classifying link types. */
const NAV_PATTERNS = ["/home", "/about", "/contact", "/menu", "/navigation", "navbar", "footer-link"];
const PROMO_PATTERNS = ["buy", "purchase", "subscribe", "sign up", "register", "download", "get started", "try", "free trial", "upgrade"];
const INFO_PATTERNS = ["/docs", "/guide", "/tutorial", "/help", "/faq", "/blog", "/article", "learn more", "read more"];

/**
 * Extract semantic meaning of links from a Document.
 * @param doc Parsed Document.
 * @param baseUrl Base URL for resolving relative links.
 * @returns EvidenceSection[] containing semantic link signals.
 */
export function extractSemanticLinks(doc: Document, baseUrl?: string): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const anchors = doc.querySelectorAll("a[href]");
  let navCount = 0;
  let infoCount = 0;
  let promoCount = 0;
  let contextualCount = 0;

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const text = anchor.textContent?.trim() ?? "";
    const lowerText = text.toLowerCase();
    const lowerHref = href.toLowerCase();

    // Classify link type
    let linkType = "contextual";
    let confidence = 0.6;

    if (NAV_PATTERNS.some((p) => lowerHref.includes(p) || lowerText.includes(p))) {
      linkType = "navigational";
      navCount++;
      confidence = 0.8;
    } else if (PROMO_PATTERNS.some((p) => lowerText.includes(p) || lowerHref.includes(p))) {
      linkType = "promotional";
      promoCount++;
      confidence = 0.85;
    } else if (INFO_PATTERNS.some((p) => lowerHref.includes(p) || lowerText.includes(p))) {
      linkType = "informational";
      infoCount++;
      confidence = 0.8;
    } else {
      contextualCount++;
    }

    signals.push({
      type: "semantic_a",
      value: truncateText(`${text || href} [${linkType}]`, 200),
      confidence,
      selector: generateSelector(anchor),
      metadata: {
        href: truncateText(href, 200),
        text,
        linkType,
        textLength: text.length,
        hasText: text.length > 0,
      },
    });
  });

  const section: EvidenceSection = {
    category: "semantic_links",
    label: "Semantic Link Analysis",
    signals: signals.slice(0, 300),
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalLinks: signals.length,
      navigationalLinks: navCount,
      informationalLinks: infoCount,
      promotionalLinks: promoCount,
      contextualLinks: contextualCount,
      linkDiversity: new Set(signals.map((s) => s.metadata?.linkType)).size,
    },
  };

  return [section];
}
