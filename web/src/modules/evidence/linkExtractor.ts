/**
 * Link Extractor — Phase 2
 * Extracts anchor (<a>) elements with href, text, and link type classification.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract link evidence from a Document.
 * @param doc Parsed Document.
 * @param baseUrl Base URL for resolving relative links.
 * @returns EvidenceSection[] containing link signals.
 */
export function extractLinks(doc: Document, baseUrl?: string): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let internalCount = 0;
  let externalCount = 0;
  let noTextCount = 0;
  let noHrefCount = 0;

  const anchors = doc.querySelectorAll("a[href]");
  const baseDomain = baseUrl ? (() => { try { return new URL(baseUrl).hostname; } catch { return ""; } })() : "";

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute("href") ?? "";
    const text = anchor.textContent?.trim() ?? "";
    const selector = generateSelector(anchor);

    if (!href) {
      noHrefCount++;
      return;
    }

    // Classify link
    let linkType = "internal";
    try {
      const url = new URL(href, baseUrl || "https://example.com");
      if (baseDomain && url.hostname !== baseDomain) {
        linkType = "external";
        externalCount++;
      } else {
        internalCount++;
      }
    } catch {
      linkType = "relative";
      internalCount++;
    }

    if (!text) noTextCount++;

    const rel = anchor.getAttribute("rel") ?? undefined;

    signals.push({
      type: "a",
      value: truncateText(text || href, 200),
      confidence: text ? 0.9 : 0.5,
      selector,
      metadata: {
        href: truncateText(href, 300),
        linkType,
        hasText: text.length > 0,
        textLength: text.length,
        rel,
        hasNoFollow: rel?.includes("nofollow") ?? false,
        target: anchor.getAttribute("target") ?? undefined,
      },
    });
  });

  const section: EvidenceSection = {
    category: "links",
    label: "Link Structure",
    signals: signals.slice(0, 500), // Cap to prevent oversized evidence
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalLinks: signals.length,
      internalLinks: internalCount,
      externalLinks: externalCount,
      linksWithoutText: noTextCount,
      linksWithoutHref: noHrefCount,
    },
  };

  return [section];
}
