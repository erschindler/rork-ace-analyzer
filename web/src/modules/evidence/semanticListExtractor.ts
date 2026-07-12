/**
 * Semantic List Extractor — Phase 2
 * Analyzes list semantics: steps, features, attributes, definitions.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Patterns that indicate list types. */
const STEP_PATTERNS = ["step", "first", "second", "third", "then", "next", "finally", "install", "run", "execute"];
const FEATURE_PATTERNS = ["feature", "benefit", "advantage", "includes", "supports", "enables", "allows"];
const DEFINITION_PATTERNS = ["definition", "meaning", "refers to", "is defined as", "describes"];
const ATTRIBUTE_PATTERNS = ["property", "attribute", "setting", "option", "parameter", "field"];

/**
 * Extract semantic meaning of lists from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic list signals.
 */
export function extractSemanticLists(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const lists = doc.querySelectorAll("ol, ul, dl");
  let stepsCount = 0;
  let featuresCount = 0;
  let definitionsCount = 0;
  let attributesCount = 0;

  lists.forEach((list) => {
    const tag = list.tagName.toLowerCase();
    const isOrdered = tag === "ol";
    const isDefinitionList = tag === "dl";

    // Collect list items
    const items = list.querySelectorAll(":scope > li, :scope > dt");
    const itemTexts: string[] = [];
    items.forEach((item) => {
      const text = item.textContent?.trim() ?? "";
      if (text) itemTexts.push(text);
    });

    if (itemTexts.length === 0) return;

    const fullText = itemTexts.join(" ").toLowerCase();

    // Classify list type
    let listType = "general";
    let confidence = 0.6;

    if (isDefinitionList || DEFINITION_PATTERNS.some((p) => fullText.includes(p))) {
      listType = "definitions";
      definitionsCount++;
      confidence = 0.85;
    } else if (isOrdered || STEP_PATTERNS.some((p) => fullText.includes(p))) {
      listType = "steps";
      stepsCount++;
      confidence = 0.85;
    } else if (FEATURE_PATTERNS.some((p) => fullText.includes(p))) {
      listType = "features";
      featuresCount++;
      confidence = 0.8;
    } else if (ATTRIBUTE_PATTERNS.some((p) => fullText.includes(p))) {
      listType = "attributes";
      attributesCount++;
      confidence = 0.8;
    }

    signals.push({
      type: `semantic_${tag}`,
      value: truncateText(itemTexts.join(" | "), 500),
      confidence,
      selector: generateSelector(list),
      metadata: {
        tag,
        listType,
        isOrdered,
        itemCount: itemTexts.length,
        items: itemTexts.slice(0, 15),
      },
    });
  });

  const section: EvidenceSection = {
    category: "semantic_lists",
    label: "Semantic List Analysis",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalLists: signals.length,
      stepsLists: stepsCount,
      featuresLists: featuresCount,
      definitionsLists: definitionsCount,
      attributesLists: attributesCount,
      hasStructuredLists: stepsCount + featuresCount + definitionsCount + attributesCount > 0,
    },
  };

  return [section];
}
