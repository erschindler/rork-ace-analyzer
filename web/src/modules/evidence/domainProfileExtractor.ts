/**
 * Domain Profile Extractor — Phase 2
 * Detects domain-specific page types: ecommerce, blog, documentation,
 * product page, landing page, support page.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { extractVisibleTextFromElement } from "./domParser";

/** Domain type scoring profiles. */
const DOMAIN_PROFILES: Record<string, { selectors: string[]; keywords: string[]; weight: number }> = {
  ecommerce: {
    selectors: [".add-to-cart", "[data-product-id]", ".price", ".product-price", "button[class*='cart']", ".shop", "[class*='product-card']"],
    keywords: ["add to cart", "buy now", "price", "checkout", "shipping", "cart", "wishlist", "in stock", "out of stock"],
    weight: 1.0,
  },
  blog: {
    selectors: ["article.post", ".blog-post", ".entry-content", ".post-content", "time.published", ".author-bio", ".blog"],
    keywords: ["blog", "post", "author", "published", "comments", "related posts", "share this", "category"],
    weight: 1.0,
  },
  documentation: {
    selectors: [".docs", "[class*='documentation']", ".api-reference", ".code-block", "pre code", ".markdown-body", "nav.docs-nav", ".table-of-contents"],
    keywords: ["documentation", "api", "reference", "guide", "tutorial", "example", "parameter", "returns", "endpoint", "method"],
    weight: 1.0,
  },
  product_page: {
    selectors: [".product-detail", "[class*='product-info']", ".product-gallery", ".product-specs", ".product-features"],
    keywords: ["product", "features", "specifications", "details", "gallery", "description", "reviews"],
    weight: 1.0,
  },
  landing_page: {
    selectors: [".hero", "[class*='hero']", ".cta", "[class*='cta']", ".value-prop", ".features-section", ".testimonials"],
    keywords: ["get started", "sign up", "try free", "learn more", "contact us", "our platform", "our solution", "get a demo"],
    weight: 1.0,
  },
  support_page: {
    selectors: [".faq", "[class*='faq']", ".help-center", ".support", ".ticket", ".contact-support", ".knowledge-base"],
    keywords: ["help", "support", "faq", "frequently asked", "contact us", "submit a ticket", "troubleshoot", "issue", "problem"],
    weight: 1.0,
  },
  documentation_alt: {
    selectors: [".md-content", "article.markdown", ".prose", "pre > code"],
    keywords: ["install", "configuration", "usage", "cli", "command", "options", "flags"],
    weight: 0.8,
  },
};

/**
 * Detect domain-specific patterns and classify the page type.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing domain profile signals.
 */
export function extractDomainProfile(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const scores: Record<string, number> = {};
  const body = doc.body;

  if (!body) return [createEmptySection()];

  const visibleText = extractVisibleTextFromElement(body).toLowerCase();

  for (const [domainType, profile] of Object.entries(DOMAIN_PROFILES)) {
    let score = 0;

    // Check selectors
    for (const sel of profile.selectors) {
      try {
        if (doc.querySelector(sel)) {
          score += 2 * profile.weight;
        }
      } catch {
        // Invalid selector — skip
      }
    }

    // Check keywords
    for (const kw of profile.keywords) {
      if (visibleText.includes(kw)) {
        score += profile.weight;
      }
    }

    // Normalize score
    scores[domainType] = score;
  }

  // Sort by score and create signals for detected domains
  const sortedDomains = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topDomain = sortedDomains[0];
  const detectedTypes: string[] = [];

  for (const [domainType, score] of sortedDomains) {
    if (score > 0) {
      detectedTypes.push(domainType);
      signals.push({
        type: "domain_profile",
        value: `${domainType}: score ${score}`,
        confidence: Math.min(score / 10, 1.0),
        selector: "body",
        metadata: {
          domainType,
          score,
          isPrimary: domainType === topDomain?.[0],
        },
      });
    }
  }

  const primaryType = topDomain && topDomain[1] > 0 ? topDomain[0] : "unknown";

  const section: EvidenceSection = {
    category: "domainProfile",
    label: "Domain Profile Detection",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? Math.min(topDomain?.[1] ?? 0 / 10, 1.0) : 0,
    metadata: {
      primaryType,
      detectedTypes,
      scores,
      confidence: topDomain && topDomain[1] > 0 ? Math.min(topDomain[1] / 10, 1.0) : 0,
    },
  };

  return [section];
}

/** @internal */
function createEmptySection(): EvidenceSection {
  return {
    category: "domainProfile",
    label: "Domain Profile Detection",
    signals: [],
    count: 0,
    confidence: 0,
    metadata: { primaryType: "unknown", detectedTypes: [], scores: {} },
  };
}
