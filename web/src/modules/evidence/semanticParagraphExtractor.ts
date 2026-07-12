/**
 * Semantic Paragraph Extractor — Phase 2
 * Analyzes semantic meaning of paragraphs: topic, clarity, terminology consistency.
 */

import type { EvidenceSection, EvidenceSignal } from "@/types";
import { generateSelector, truncateText } from "./domParser";

/** Minimum paragraph length for semantic analysis. */
const MIN_SEMANTIC_LENGTH = 40;

/** Common terminology patterns. */
const TECHNICAL_PATTERNS = [
  /\bAPI\b/i, /\bSDK\b/i, /\bHTTP\b/i, /\bJSON\b/i, /\bSQL\b/i,
  /\balgorithm\b/i, /\bfunction\b/i, /\bparameter\b/i, /\bvariable\b/i,
  /\bconfigure?\b/i, /\bdeploy\b/i, /\binstance\b/i, /\basync\b/i,
];

/**
 * Extract semantic meaning of paragraphs from a Document.
 * @param doc Parsed Document.
 * @returns EvidenceSection[] containing semantic paragraph signals.
 */
export function extractSemanticParagraphs(doc: Document): EvidenceSection[] {
  const signals: EvidenceSignal[] = [];
  const paragraphs = doc.querySelectorAll("p");
  let clearCount = 0;
  let techTermCount = 0;
  const termFrequency = new Map<string, number>();

  paragraphs.forEach((p) => {
    const text = p.textContent?.trim() ?? "";
    if (!text) return;

    const wordCount = text.split(/\s+/).length;
    const isSubstantive = text.length >= MIN_SEMANTIC_LENGTH;
    const isClear = isSubstantive && wordCount > 10;

    if (isClear) clearCount++;

    // Detect technical terminology
    const techMatches: string[] = [];
    for (const pattern of TECHNICAL_PATTERNS) {
      const match = text.match(pattern);
      if (match) {
        techMatches.push(match[0]);
        techTermCount++;
        const term = match[0].toLowerCase();
        termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
      }
    }

    // Detect topic (most frequent significant words)
    const words = text.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    const wordFreq = new Map<string, number>();
    words.forEach((w) => wordFreq.set(w, (wordFreq.get(w) ?? 0) + 1));
    const sortedWords = [...wordFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([w]) => w);

    signals.push({
      type: "semantic_p",
      value: truncateText(text, 500),
      confidence: isClear ? 0.85 : 0.5,
      selector: generateSelector(p),
      metadata: {
        textLength: text.length,
        wordCount,
        isSubstantive,
        isClear,
        topicKeywords: sortedWords,
        hasTechnicalTerms: techMatches.length > 0,
        technicalTerms: techMatches,
        sentenceCount: (text.match(/[.!?]+/g) ?? []).length,
      },
    });
  });

  const section: EvidenceSection = {
    category: "semantic_paragraphs",
    label: "Semantic Paragraph Analysis",
    signals: signals.slice(0, 200),
    count: signals.length,
    confidence: signals.length > 0 ? signals.reduce((s, sig) => s + sig.confidence, 0) / signals.length : 0,
    metadata: {
      totalParagraphs: signals.length,
      clearParagraphs: clearCount,
      clarityRatio: signals.length > 0 ? clearCount / signals.length : 0,
      technicalTermCount: techTermCount,
      topTerms: [...termFrequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([t, c]) => ({ term: t, count: c })),
      hasTerminologyConsistency: termFrequency.size > 0,
    },
  };

  return [section];
}
