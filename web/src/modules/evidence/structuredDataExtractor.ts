/**
 * Structured Data Extractor — Phase 2
 * Extracts JSON-LD, microdata, RDFa, and other structured data formats.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract structured data evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing structured data signals.
 */
export function extractStructuredData(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let jsonLdCount = 0;
  let microdataCount = 0;
  let rdfaCount = 0;
  const schemaTypes: string[] = [];

  // JSON-LD
  const jsonLdScripts = doc.querySelectorAll('script[type="application/ld+json"]');
  jsonLdScripts.forEach((script) => {
    const content = script.textContent?.trim() ?? "";
    if (!content) return;

    jsonLdCount++;

    try {
      const parsed = JSON.parse(content);
      const items = Array.isArray(parsed) ? parsed : [parsed];

      items.forEach((item) => {
        const itemType = item["@type"] ?? "unknown";
        if (typeof itemType === "string") {
          schemaTypes.push(itemType);
        }

        signals.push({
          type: "json_ld",
          value: truncateText(itemType, 100),
          confidence: 0.95,
          selector: generateSelector(script),
          metadata: {
            schemaType: itemType,
            parsed: item,
            graph: item["@graph"] !== undefined,
          },
        });
      });
    } catch {
      signals.push({
        type: "json_ld_invalid",
        value: truncateText(content, 200),
        confidence: 0.3,
        selector: generateSelector(script),
        metadata: { issue: "invalid_json", rawLength: content.length },
      });
    }
  });

  // Microdata (itemscope, itemtype, itemprop)
  const microdataEls = doc.querySelectorAll("[itemscope]");
  microdataEls.forEach((el) => {
    microdataCount++;
    const itemType = el.getAttribute("itemtype") ?? "unknown";
    const props = el.querySelectorAll("[itemprop]");
    const propData: Record<string, string> = {};
    props.forEach((prop) => {
      const propName = prop.getAttribute("itemprop") ?? "";
      const propValue = prop.getAttribute("content") ?? prop.textContent?.trim() ?? "";
      if (propName) propData[propName] = truncateText(propValue, 100);
    });

    signals.push({
      type: "microdata",
      value: truncateText(itemType, 200),
      confidence: 0.85,
      selector: generateSelector(el),
      metadata: { itemType, properties: propData },
    });
  });

  // RDFa (typeof, property, vocab)
  const rdfaEls = doc.querySelectorAll("[typeof], [property], [vocab]");
  rdfaEls.forEach((el) => {
    rdfaCount++;
    const typeof_ = el.getAttribute("typeof") ?? "";
    const property = el.getAttribute("property") ?? "";

    signals.push({
      type: "rdfa",
      value: truncateText(typeof_ || property, 200),
      confidence: 0.8,
      selector: generateSelector(el),
      metadata: { typeof: typeof_, property, vocab: el.getAttribute("vocab") ?? undefined },
    });
  });

  // Meta itemprops (common in Open Graph + microdata hybrid)
  const metaItemprops = doc.querySelectorAll('meta[itemprop]');
  metaItemprops.forEach((meta) => {
    const prop = meta.getAttribute("itemprop") ?? "";
    const content = meta.getAttribute("content") ?? "";
    if (prop && content) {
      signals.push({
        type: "meta_itemprop",
        value: truncateText(`${prop}: ${content}`, 200),
        confidence: 0.85,
        selector: generateSelector(meta),
        metadata: { prop, content },
      });
    }
  });

  const section: EvidenceSection = {
    category: "structuredData",
    label: "Structured Data",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      jsonLdCount,
      microdataCount,
      rdfaCount,
      schemaTypes: [...new Set(schemaTypes)],
      hasSchemaOrg: schemaTypes.some((t) => t.toLowerCase().includes("schema.org") || t.includes("Article") || t.includes("Product") || t.includes("Organization") || t.includes("Breadcrumb")),
    },
  };

  return [section];
}
