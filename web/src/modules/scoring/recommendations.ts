/**
 * Recommendation Framework — Phase 4 (ACE v1.2)
 * Factory helpers for creating standardized recommendations.
 */

import type { Recommendation } from "@/types";

/**
 * Create a recommendation with a deterministic ID.
 * @param metric Metric key prefix.
 * @param category Recommendation category.
 * @param priority Priority level.
 * @param message Human-readable message.
 * @param index Optional index for uniqueness.
 * @returns Recommendation object.
 */
export function rec(
  metric: string,
  category: Recommendation["category"],
  priority: Recommendation["priority"],
  message: string,
  index: number = 0,
): Recommendation {
  return {
    id: `${metric}_rec_${index}`,
    category,
    priority,
    message,
  };
}

/** Common recommendation templates per category. */
export const REC_TEMPLATES = {
  structure: {
    addHeadings: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "structure", "high", "Add proper heading hierarchy (h1 → h2 → h3) to improve document structure for machine comprehension.", i),
    fixHierarchy: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "structure", "medium", "Fix heading hierarchy — avoid skipping levels (e.g., h1 → h3).", i),
    addLandmarks: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "structure", "medium", "Add semantic landmark elements (<main>, <nav>, <header>, <footer>) to improve structure.", i),
  },
  semantic: {
    addSemanticHtml: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "semantic", "high", "Use semantic HTML5 elements (<article>, <section>, <aside>, <nav>) instead of generic <div> wrappers.", i),
    addSemanticStructure: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "semantic", "medium", "Add semantic structure with sectioning elements to create a clear content hierarchy.", i),
  },
  accessibility: {
    addAltText: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "accessibility", "high", "Add descriptive alt text to all informational images.", i),
    addAriaLabels: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "accessibility", "medium", "Add ARIA labels to interactive elements without visible text.", i),
    addSkipLink: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "accessibility", "low", "Add a skip-to-content link at the top of the page for keyboard navigation.", i),
    addFormLabels: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "accessibility", "medium", "Associate all form inputs with <label> elements.", i),
  },
  extractability: {
    reduceNoise: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "extractability", "high", "Reduce noise from boilerplate, ads, and navigation to improve content extractability.", i),
    addMainContent: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "extractability", "high", "Wrap primary content in a <main> element to improve extractability.", i),
    reduceRedundancy: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "extractability", "medium", "Remove or deduplicate repeated content blocks.", i),
  },
  content: {
    improveReadability: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "content", "medium", "Shorten long sentences and simplify vocabulary to improve readability.", i),
    addContent: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "content", "high", "Add more substantive content — current content is too sparse for machine comprehension.", i),
    improveClarity: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "content", "medium", "Use clear, unambiguous language and avoid jargon without context.", i),
  },
  metadata: {
    addJsonLd: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "metadata", "high", "Add JSON-LD structured data with schema.org types to improve machine comprehension.", i),
    addMetaDescription: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "metadata", "medium", "Add a descriptive <meta name=\"description\"> tag.", i),
    addCanonical: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "metadata", "low", "Add a <link rel=\"canonical\"> to specify the preferred URL.", i),
    addOpenGraph: (metric: string, i: number = 0): Recommendation =>
      rec(metric, "metadata", "low", "Add Open Graph metadata (og:title, og:description, og:image) for social sharing.", i),
  },
} as const;
