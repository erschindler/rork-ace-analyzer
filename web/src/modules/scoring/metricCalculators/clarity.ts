/**
 * Clarity Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: normalizedSentences, normalizedWords, paragraphs
 * Formula: weightedSum(sentenceClarityScore, vocabularyClarityScore, paragraphClarityScore, ambiguityScore)
 * Contamination impact: script_only_dom, encoding_failure reduce score.
 */

import type { MetricResult } from "../scoringTypes";
import {
  createScoredResult,
  createInsufficientResult,
  clampScore,
  applyContaminationPenalty,
  applyContaminationConfidence,
  buildFormula,
  countContentSignals,
  getAllSignals,
  type MetricContext,
} from "../scoringTypes";
import { REC_TEMPLATES, rec } from "../recommendations";

/** Ambiguous/vague words that reduce clarity. */
const VAGUE_WORDS = new Set([
  "thing", "things", "stuff", "something", "anything", "everything",
  "various", "some", "many", "few", "several", "certain",
  "it", "they", "them", "this", "that", "these", "those",
]);

/** Weights for clarity components. */
const COMPONENT_WEIGHTS = {
  sentenceClarityScore: 0.30,
  vocabularyClarityScore: 0.25,
  paragraphClarityScore: 0.25,
  ambiguityScore: 0.20,
} as const;

/**
 * Calculate the Clarity metric score.
 */
export function calculateClarity(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const sentences = normalized.normalizedSentences;
  const words = normalized.normalizedWords;
  const paragraphCount = countContentSignals(normalized.paragraphs);

  if (sentences.length === 0 || words.length === 0) {
    return createInsufficientResult(
      "clarity",
      "No sentences or words available for clarity analysis",
      { sentenceCount: sentences.length, wordCount: words.length, paragraphCount },
    );
  }

  // Component 1: Sentence clarity — shorter, well-structured sentences are clearer
  const avgWordsPerSentence = words.length / sentences.length;
  let sentenceClarityScore: number;
  if (avgWordsPerSentence <= 20 && avgWordsPerSentence >= 8) {
    sentenceClarityScore = 90;
  } else if (avgWordsPerSentence > 30) {
    sentenceClarityScore = Math.max(30, 90 - (avgWordsPerSentence - 30) * 3);
  } else if (avgWordsPerSentence < 5) {
    sentenceClarityScore = 60;
  } else {
    sentenceClarityScore = 75;
  }
  sentenceClarityScore = clampScore(sentenceClarityScore);

  // Component 2: Vocabulary clarity — ratio of common vs complex words
  const longWords = words.filter((w) => w.length > 10);
  const longWordRatio = longWords.length / words.length;
  let vocabularyClarityScore: number;
  if (longWordRatio < 0.05) {
    vocabularyClarityScore = 95;
  } else if (longWordRatio < 0.10) {
    vocabularyClarityScore = 85;
  } else if (longWordRatio < 0.20) {
    vocabularyClarityScore = 70;
  } else {
    vocabularyClarityScore = Math.max(30, 90 - longWordRatio * 100);
  }
  vocabularyClarityScore = clampScore(vocabularyClarityScore);

  // Component 3: Paragraph clarity — paragraphs with moderate length are clearer
  let paragraphClarityScore: number;
  if (paragraphCount >= 5) {
    paragraphClarityScore = 85;
  } else if (paragraphCount >= 2) {
    paragraphClarityScore = 70;
  } else if (paragraphCount >= 1) {
    paragraphClarityScore = 50;
  } else {
    paragraphClarityScore = 30;
  }
  paragraphClarityScore = clampScore(paragraphClarityScore);

  // Component 4: Ambiguity — count vague/ambiguous words
  const lowerWords = words.map((w) => w.toLowerCase());
  let vagueCount = 0;
  for (const word of lowerWords) {
    if (VAGUE_WORDS.has(word)) vagueCount++;
  }
  const vagueRatio = vagueCount / words.length;
  let ambiguityScore: number;
  if (vagueRatio < 0.05) {
    ambiguityScore = 95;
  } else if (vagueRatio < 0.10) {
    ambiguityScore = 80;
  } else if (vagueRatio < 0.20) {
    ambiguityScore = 60;
  } else {
    ambiguityScore = Math.max(25, 90 - vagueRatio * 150);
  }
  ambiguityScore = clampScore(ambiguityScore);

  const components = {
    sentenceClarityScore,
    vocabularyClarityScore,
    paragraphClarityScore,
    ambiguityScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  const contaminationResult = applyContaminationPenalty(score, ctx, ["script_only_dom", "encoding_failure", "boilerplate_only"]);
  score = clampScore(contaminationResult.score);

  let confidence = 0.82;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  const evidence: string[] = [
    `${sentences.length} sentences, ${words.length} words`,
    `Average words per sentence: ${avgWordsPerSentence.toFixed(1)}`,
    `Long word ratio (>10 chars): ${(longWordRatio * 100).toFixed(1)}%`,
    `Vague word ratio: ${(vagueRatio * 100).toFixed(1)}%`,
    `${paragraphCount} paragraphs`,
  ];

  const weaknesses: string[] = [];
  if (avgWordsPerSentence > 30) weaknesses.push("Sentences are too long for clear machine comprehension");
  if (longWordRatio > 0.15) weaknesses.push("High proportion of complex/long words reduces clarity");
  if (vagueRatio > 0.15) weaknesses.push("High use of vague/ambiguous words (thing, stuff, various, etc.)");
  if (paragraphCount < 2) weaknesses.push("Insufficient paragraph structure for clear content segmentation");
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  const recommendations = [];
  let recIndex = 0;
  if (avgWordsPerSentence > 25) {
    recommendations.push(REC_TEMPLATES.content.improveClarity("clarity", recIndex++));
  }
  if (vagueRatio > 0.10) {
    recommendations.push(rec("clarity", "content", "medium", "Replace vague words (thing, stuff, various) with specific, descriptive terms.", recIndex++));
  }
  if (longWordRatio > 0.15) {
    recommendations.push(rec("clarity", "content", "low", "Simplify complex vocabulary where common alternatives exist.", recIndex++));
  }

  return createScoredResult("clarity", score, confidence, evidence, weaknesses, recommendations, {
    inputs: {
      sentenceCount: sentences.length,
      wordCount: words.length,
      avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100,
      longWordRatio: Math.round(longWordRatio * 10000) / 10000,
      vagueRatio: Math.round(vagueRatio * 10000) / 10000,
      paragraphCount,
    },
    components,
    formula: buildFormula(COMPONENT_WEIGHTS, score),
    result: score,
  });
}
