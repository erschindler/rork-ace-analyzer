/**
 * Structured Content Extractor — Phase 2
 * Detects structured content blocks: FAQ, pricing tables, product specs,
 * feature lists, comparison tables, review blocks, Q&A blocks.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Patterns for detecting structured content blocks. */
const FAQ_SELECTORS = [
  ".faq", "[class*='faq']", "[class*='frequently-asked']",
  "details > summary", ".accordion-item",
];

const PRICING_SELECTORS = [
  ".pricing-table", ".pricing-card", "[class*='pricing']",
  ".plan-card", ".price-card", "[class*='plan-']",
];

const SPECS_SELECTORS = [
  ".product-specs", ".specifications", "[class*='spec']",
  ".tech-specs", ".product-details",
];

const FEATURE_SELECTORS = [
  ".features-list", ".feature-list", "[class*='feature']",
  ".benefits-list", ".advantages",
];

const REVIEW_SELECTORS = [
  ".review", ".reviews", "[class*='review']",
  ".testimonial", ".testimonials", "[class*='testimonial']",
  ".rating", ".star-rating",
];

const QA_SELECTORS = [
  ".qa", ".q-a", "[class*='question-answer']",
  ".comment-question", ".discussion",
];

/**
 * Detect structured content blocks from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing structured content signals.
 */
export function extractStructuredContent(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];

  // FAQ sections
  let faqCount = 0;
  for (const sel of FAQ_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        faqCount++;
        const summary = el.querySelector("summary, .faq-question, .accordion-title")?.textContent?.trim() ?? "";
        const answer = el.querySelector(".faq-answer, .accordion-content, :scope > p")?.textContent?.trim() ?? "";
        signals.push({
          type: "faq_block",
          value: truncateText(summary || "FAQ item", 300),
          confidence: 0.85,
          selector: generateSelector(el),
          metadata: {
            blockType: "faq",
            question: summary,
            answer: truncateText(answer, 300),
          },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip invalid selector */ }
  }

  // Pricing tables
  let pricingCount = 0;
  for (const sel of PRICING_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        pricingCount++;
        const text = el.textContent?.trim() ?? "";
        const price = text.match(/\$\d+(?:\.\d{2})?/)?.[0];
        signals.push({
          type: "pricing_block",
          value: truncateText(text, 300),
          confidence: 0.9,
          selector: generateSelector(el),
          metadata: {
            blockType: "pricing",
            detectedPrice: price,
            planName: el.querySelector("h3, h4, .plan-name")?.textContent?.trim(),
          },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip */ }
  }

  // Product specs
  let specsCount = 0;
  for (const sel of SPECS_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        specsCount++;
        const rows = el.querySelectorAll("tr, dt, .spec-row, .spec-item");
        const specData: string[] = [];
        rows.forEach((row) => {
          const text = row.textContent?.trim() ?? "";
          if (text) specData.push(truncateText(text, 100));
        });
        signals.push({
          type: "specs_block",
          value: truncateText(specData.join(" | "), 300),
          confidence: 0.85,
          selector: generateSelector(el),
          metadata: {
            blockType: "specifications",
            specCount: specData.length,
            specs: specData.slice(0, 15),
          },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip */ }
  }

  // Feature lists
  let featureCount = 0;
  for (const sel of FEATURE_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        featureCount++;
        const features = el.querySelectorAll("li, .feature-item, .benefit-item");
        const featureTexts: string[] = [];
        features.forEach((f) => {
          const text = f.textContent?.trim() ?? "";
          if (text) featureTexts.push(truncateText(text, 100));
        });
        signals.push({
          type: "feature_block",
          value: truncateText(featureTexts.join(" | "), 300),
          confidence: 0.8,
          selector: generateSelector(el),
          metadata: {
            blockType: "features",
            featureCount: featureTexts.length,
            features: featureTexts.slice(0, 15),
          },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip */ }
  }

  // Review blocks
  let reviewCount = 0;
  for (const sel of REVIEW_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        reviewCount++;
        const text = el.textContent?.trim() ?? "";
        const rating = el.querySelector("[class*='star'], .rating-value")?.textContent?.trim();
        const author = el.querySelector(".review-author, .testimonial-author, [class*='author']")?.textContent?.trim();
        signals.push({
          type: "review_block",
          value: truncateText(text, 300),
          confidence: 0.8,
          selector: generateSelector(el),
          metadata: {
            blockType: "review",
            detectedRating: rating,
            author: author?.trim(),
          },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip */ }
  }

  // Q&A blocks
  let qaCount = 0;
  for (const sel of QA_SELECTORS) {
    try {
      const elements = doc.querySelectorAll(sel);
      elements.forEach((el) => {
        qaCount++;
        const text = el.textContent?.trim() ?? "";
        signals.push({
          type: "qa_block",
          value: truncateText(text, 300),
          confidence: 0.75,
          selector: generateSelector(el),
          metadata: { blockType: "qa" },
        });
      });
      if (elements.length > 0) break;
    } catch { /* skip */ }
  }

  // Comparison tables (tables with > 2 columns and comparison keywords)
  const tables = doc.querySelectorAll("table");
  let comparisonCount = 0;
  tables.forEach((table) => {
    const headers = table.querySelectorAll("thead th, thead td");
    const headerText = Array.from(headers).map((h) => h.textContent?.toLowerCase() ?? "").join(" ");
    if (headers.length > 2 && (headerText.includes("compare") || headerText.includes("vs") || headerText.includes("plan"))) {
      comparisonCount++;
      signals.push({
        type: "comparison_block",
        value: truncateText(headerText, 200),
        confidence: 0.85,
        selector: generateSelector(table),
        metadata: {
          blockType: "comparison",
          columnCount: headers.length,
          headers: Array.from(headers).map((h) => h.textContent?.trim() ?? "").slice(0, 10),
        },
      });
    }
  });

  const section: EvidenceSection = {
    category: "structuredContent",
    label: "Structured Content Blocks",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      faqBlocks: faqCount,
      pricingBlocks: pricingCount,
      specsBlocks: specsCount,
      featureBlocks: featureCount,
      reviewBlocks: reviewCount,
      qaBlocks: qaCount,
      comparisonBlocks: comparisonCount,
      hasStructuredContent: signals.length > 0,
      totalBlocks: signals.length,
    },
  };

  return [section];
}
