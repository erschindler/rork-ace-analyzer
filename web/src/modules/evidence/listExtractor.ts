/**
 * List Extractor — Phase 2
 * Extracts ordered (<ol>) and unordered (<ul>) lists with their items.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/**
 * Extract list evidence from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing list signals.
 */
export function extractLists(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  let orderedCount = 0;
  let unorderedCount = 0;
  let totalItems = 0;

  const lists = doc.querySelectorAll("ol, ul");
  lists.forEach((list) => {
    const tag = list.tagName.toLowerCase();
    const isOrdered = tag === "ol";
    if (isOrdered) orderedCount++;
    else unorderedCount++;

    const items = list.querySelectorAll(":scope > li");
    const itemCount = items.length;
    totalItems += itemCount;

    const itemTexts: string[] = [];
    items.forEach((li) => {
      const text = li.textContent?.trim() ?? "";
      if (text) itemTexts.push(truncateText(text, 200));
    });

    if (itemTexts.length > 0) {
      signals.push({
        type: tag,
        value: truncateText(itemTexts.join(" | "), 500),
        confidence: 0.85,
        selector: generateSelector(list),
        metadata: {
          listType: isOrdered ? "ordered" : "unordered",
          itemCount,
          items: itemTexts.slice(0, 20),
          hasNested: list.querySelector("ol, ul") !== null,
        },
      });
    }
  });

  const section: EvidenceSection = {
    category: "lists",
    label: "List Structures",
    signals,
    count: signals.length,
    confidence: signals.length > 0 ? 0.85 : 0,
    metadata: {
      totalLists: signals.length,
      orderedLists: orderedCount,
      unorderedLists: unorderedCount,
      totalItems,
    },
  };

  return [section];
}
