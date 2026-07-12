/**
 * Extractability Analyzer — Phase 2
 * Analyzes content density, noise ratio, and extractability signals.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { extractVisibleTextFromElement, extractMainContent, generateSelector } from "./domParser";

/** Minimum content density to be considered extractable. */
const MIN_CONTENT_DENSITY = 0.3;

/** Tags considered noise/boilerplate. 
 * NOTE: script/style/iframe/noscript are NOT included here because
 * extractVisibleTextFromElement already strips them from the full text.
 * Including them would count JavaScript/CSS code as "noise text",
 * inflating the noise ratio above 1.0. Only visible-but-non-content
 * elements are noise: nav, footer, header, aside. */
const NOISE_TAGS = new Set(["nav", "footer", "header", "aside"]);

/**
 * Analyze extractability of a Document's content.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing extractability signals.
 */
export function analyzeExtractability(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const mainContent = extractMainContent(doc);

  // Content density
  const fullText = extractVisibleTextFromElement(doc.body ?? doc.documentElement);
  const mainText = extractVisibleTextFromElement(mainContent);
  const fullLength = fullText.length;
  const mainLength = mainText.length;
  const contentDensity = fullLength > 0 ? mainLength / fullLength : 0;

  signals.push({
    type: "content_density",
    value: `${(contentDensity * 100).toFixed(1)}%`,
    confidence: 0.9,
    selector: "body",
    metadata: {
      fullTextLength: fullLength,
      mainTextLength: mainLength,
      contentDensity,
      isExtractable: contentDensity >= MIN_CONTENT_DENSITY,
    },
  });

  // Noise ratio — count text from top-level noise elements only.
  // ACE v1.2 fix: Previously iterated ALL elements including nested children,
  // causing double/triple counting (e.g. header > nav > ul > li text counted 4x).
  // Now we only count top-level noise elements (not nested within each other).
  let noiseTextLength = 0;
  const countedNoiseElements: Element[] = [];
  doc.querySelectorAll("*").forEach((el) => {
    const tag = el.tagName.toLowerCase();
    if (NOISE_TAGS.has(tag)) {
      // Check if this element is nested inside another noise element already counted
      const isNested = countedNoiseElements.some((parent) => parent.contains(el));
      if (!isNested) {
        noiseTextLength += extractVisibleTextFromElement(el).length;
        countedNoiseElements.push(el);
      }
    }
  });
  const noiseRatio = fullLength > 0 ? Math.min(noiseTextLength / fullLength, 1.0) : 0;

  signals.push({
    type: "noise_ratio",
    value: `${(noiseRatio * 100).toFixed(1)}%`,
    confidence: 0.85,
    selector: "body",
    metadata: {
      noiseTextLength,
      noiseRatio,
      isHighNoise: noiseRatio > 0.5,
    },
  });

  // Repeated blocks detection
  const textBlocks = doc.querySelectorAll("p, div, span, li, td");
  const blockTexts = new Map<string, number>();
  textBlocks.forEach((block) => {
    const text = block.textContent?.trim() ?? "";
    if (text.length > 30) {
      const key = text.substring(0, 100);
      blockTexts.set(key, (blockTexts.get(key) ?? 0) + 1);
    }
  });
  let repeatedBlocks = 0;
  blockTexts.forEach((count) => {
    if (count > 1) repeatedBlocks++;
  });

  signals.push({
    type: "repeated_blocks",
    value: `${repeatedBlocks} repeated text blocks`,
    confidence: 0.8,
    selector: "body",
    metadata: {
      totalBlocks: textBlocks.length,
      repeatedBlocks,
      hasRepeatedContent: repeatedBlocks > 5,
    },
  });

  // Boilerplate detection
  const boilerplateSelectors = [
    "#cookie-banner", ".cookie-banner", "#gdpr", ".gdpr",
    "#sidebar", ".sidebar", "#comments", ".comments",
    "#related", ".related-posts", "#ad", ".advertisement",
  ];
  let boilerplateElements = 0;
  boilerplateSelectors.forEach((sel) => {
    if (doc.querySelector(sel)) boilerplateElements++;
  });

  signals.push({
    type: "boilerplate_detection",
    value: `${boilerplateElements} boilerplate regions`,
    confidence: 0.75,
    selector: "body",
    metadata: {
      boilerplateElements,
      hasSignificantBoilerplate: boilerplateElements >= 3,
    },
  });

  // Extractable vs non-extractable regions
  const extractableRegion = mainContent;
  const extractableSelector = generateSelector(extractableRegion);
  signals.push({
    type: "extractable_region",
    value: extractableSelector,
    confidence: 0.85,
    selector: extractableSelector,
    metadata: {
      textLength: mainLength,
      tag: extractableRegion.tagName.toLowerCase(),
    },
  });

  const section: EvidenceSection = {
    category: "extractability",
    label: "Extractability Analysis",
    signals,
    count: signals.length,
    confidence: signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length,
    metadata: {
      contentDensity,
      noiseRatio,
      isExtractable: contentDensity >= MIN_CONTENT_DENSITY && noiseRatio < 0.7,
      repeatedBlocks,
      boilerplateElements,
    },
  };

  return [section];
}
