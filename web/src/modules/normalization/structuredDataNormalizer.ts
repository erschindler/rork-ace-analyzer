/**
 * Structured Data Normalizer — Phase 3
 * Normalizes JSON-LD, schema.org types, Microdata, and RDFa.
 * Standardizes schema type labels and validates structured data format.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";
import { normalizeParagraphText } from "./textNormalizer";

/** Schema.org type canonicalization map. */
const SCHEMA_TYPE_MAP: Record<string, string> = {
  "article": "Article",
  "blogposting": "BlogPosting",
  "newsarticle": "NewsArticle",
  "scholarlyarticle": "ScholarlyArticle",
  "techarticle": "TechArticle",
  "product": "Product",
  "offer": "Offer",
  "aggregateoffer": "AggregateOffer",
  "organization": "Organization",
  "localbusiness": "LocalBusiness",
  "corporation": "Corporation",
  "breadcrumblist": "BreadcrumbList",
  "webpage": "WebPage",
  "website": "WebSite",
  "person": "Person",
  "event": "Event",
  "place": "Place",
  "review": "Review",
  "aggregaterating": "AggregateRating",
  "faqpage": "FAQPage",
  "howto": "HowTo",
  "question": "Question",
  "answer": "Answer",
  "videobject": "VideoObject",
  "imageobject": "ImageObject",
};

/**
 * Normalize structured data evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized structured data sections.
 */
export function normalizeStructuredData(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.structuredData) {
    const normalized = normalizeSection(section, "structuredData", isContaminated);

    let jsonLdCount = 0;
    let microdataCount = 0;
    let rdfaCount = 0;
    let invalidCount = 0;
    const schemaTypes: string[] = [];

    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      switch (sig.type) {
        case "json_ld":
          jsonLdCount++;
          return normalizeJsonLd(sig, schemaTypes);

        case "json_ld_invalid":
          invalidCount++;
          return normalizeInvalidJsonLd(sig);

        case "microdata":
          microdataCount++;
          return normalizeMicrodata(sig, schemaTypes);

        case "rdfa":
          rdfaCount++;
          return normalizeRdfa(sig);

        case "meta_itemprop":
          return normalizeMetaItemprop(sig);

        default:
          return sig;
      }
    });

    // Add structured data summary
    const hasValidSchema = jsonLdCount > 0 || microdataCount > 0;
    const uniqueSchemaTypes = [...new Set(schemaTypes)];

    normalized.normalizedSignals.push({
      type: "structured_data_summary",
      value: `${uniqueSchemaTypes.length} schema types, ${jsonLdCount} JSON-LD, ${microdataCount} microdata, ${rdfaCount} RDFa`,
      confidence: hasValidSchema ? 0.9 : 0.3,
      selector: "head",
      metadata: {
        jsonLdCount,
        microdataCount,
        rdfaCount,
        invalidCount,
        schemaTypes: uniqueSchemaTypes,
        hasValidSchema,
        hasSchemaOrg: uniqueSchemaTypes.length > 0,
        contaminationImpact: isContaminated,
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => `${s.type}: ${s.value}`)
      .filter((v) => v.length > 0)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Normalize a JSON-LD signal.
 */
function normalizeJsonLd(sig: NormalizedSignal, schemaTypes: string[]): NormalizedSignal {
  const rawType = (sig.metadata?.schemaType as string) ?? "unknown";
  const canonicalType = canonicalizeSchemaType(rawType);
  schemaTypes.push(canonicalType);

  return {
    ...sig,
    value: canonicalType,
    confidence: 0.95,
    metadata: {
      ...sig.metadata,
      schemaType: canonicalType,
      originalType: rawType,
      format: "json_ld",
      hasGraph: sig.metadata?.graph as boolean | undefined,
      category: "structured_data",
    },
  };
}

/**
 * Normalize an invalid JSON-LD signal.
 */
function normalizeInvalidJsonLd(sig: NormalizedSignal): NormalizedSignal {
  const rawLength = (sig.metadata?.rawLength as number) ?? 0;

  return {
    ...sig,
    value: `Invalid JSON-LD (${rawLength} chars)`,
    confidence: 0.3,
    metadata: {
      ...sig.metadata,
      issue: "invalid_json",
      severity: "warning",
      rawLength,
      format: "json_ld",
      category: "structured_data_error",
    },
  };
}

/**
 * Normalize a microdata signal.
 */
function normalizeMicrodata(sig: NormalizedSignal, schemaTypes: string[]): NormalizedSignal {
  const rawType = (sig.metadata?.itemType as string) ?? "unknown";
  const canonicalType = canonicalizeSchemaType(rawType);
  schemaTypes.push(canonicalType);

  const properties = (sig.metadata?.properties as Record<string, string>) ?? {};

  return {
    ...sig,
    value: canonicalType,
    confidence: 0.85,
    metadata: {
      ...sig.metadata,
      itemType: canonicalType,
      originalType: rawType,
      properties,
      propertyCount: Object.keys(properties).length,
      format: "microdata",
      category: "structured_data",
    },
  };
}

/**
 * Normalize an RDFa signal.
 */
function normalizeRdfa(sig: NormalizedSignal): NormalizedSignal {
  const typeof_ = (sig.metadata?.typeof as string) ?? "";
  const property = (sig.metadata?.property as string) ?? "";
  const vocab = (sig.metadata?.vocab as string) ?? undefined;

  return {
    ...sig,
    value: typeof_ || property,
    confidence: 0.8,
    metadata: {
      ...sig.metadata,
      typeof: typeof_,
      property,
      vocab,
      format: "rdfa",
      category: "structured_data",
    },
  };
}

/**
 * Normalize a meta itemprop signal.
 */
function normalizeMetaItemprop(sig: NormalizedSignal): NormalizedSignal {
  const prop = (sig.metadata?.prop as string) ?? "";
  const content = normalizeParagraphText((sig.metadata?.content as string) ?? "");

  return {
    ...sig,
    value: `${prop}: ${content}`,
    confidence: 0.85,
    metadata: {
      ...sig.metadata,
      prop,
      content,
      format: "meta_itemprop",
      category: "structured_data",
    },
  };
}

/**
 * Canonicalize a schema.org type name.
 */
function canonicalizeSchemaType(rawType: string): string {
  if (!rawType || rawType === "unknown") return "unknown";

  const lower = rawType.toLowerCase().replace(/^https?:\/\/schema\.org\//, "");
  return SCHEMA_TYPE_MAP[lower] ?? rawType;
}
