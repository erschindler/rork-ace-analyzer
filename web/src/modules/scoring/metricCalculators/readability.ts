/**
 * Readability Metric Calculator — Phase 4 (ACE v1.2)
 *
 * Required evidence: normalizedSentences, normalizedWords
 * Formula: weightedSum(sentenceLengthScore, wordComplexityScore, avgWordsPerSentenceScore, textVolumeScore)
 * Contamination impact: script_only_dom reduces score and confidence.
 */

import type { MetricResult } from "../scoringTypes";
import {
  createScoredResult,
  createInsufficientResult,
  clampScore,
  applyContaminationPenalty,
  applyContaminationConfidence,
  buildFormula,
  type MetricContext,
} from "../scoringTypes";
import { rec, REC_TEMPLATES } from "../recommendations";

/** Ideal sentence length range (words). */
const IDEAL_SENTENCE_MIN = 8;
const IDEAL_SENTENCE_MAX = 25;
const MAX_SENTENCE_LENGTH = 40;

/** Weights for readability components. */
const COMPONENT_WEIGHTS = {
  sentenceLengthScore: 0.30,
  wordComplexityScore: 0.25,
  avgWordsPerSentenceScore: 0.25,
  textVolumeScore: 0.20,
} as const;

/**
 * Calculate the Readability metric score.
 * @param ctx Metric context with normalized evidence.
 * @returns MetricResult for readability.
 */
export function calculateReadability(ctx: MetricContext): MetricResult {
  const { normalized } = ctx;
  const sentences = normalized.normalizedSentences;
  const words = normalized.normalizedWords;

  // Validate required evidence
  if (sentences.length === 0 || words.length === 0) {
    return createInsufficientResult(
      "readability",
      "No sentences or words available for readability analysis",
      { sentenceCount: sentences.length, wordCount: words.length },
    );
  }

  // Component 1: Sentence length score — penalize very long and very short sentences
  let goodSentenceCount = 0;
  let tooLongCount = 0;
  for (const sentence of sentences) {
    const wordCount = sentence.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount >= IDEAL_SENTENCE_MIN && wordCount <= IDEAL_SENTENCE_MAX) {
      goodSentenceCount++;
    }
    if (wordCount > MAX_SENTENCE_LENGTH) {
      tooLongCount++;
    }
  }
  const sentenceLengthScore = clampScore(
    (goodSentenceCount / sentences.length) * 100 - tooLongCount * 5,
  );

  // Component 2: Word complexity — estimate via average word length
  const totalChars = words.reduce((sum, w) => sum + w.length, 0);
  const avgWordLength = words.length > 0 ? totalChars / words.length : 0;
  // Ideal avg word length: 4-6 chars; penalize very long (complex) or very short
  let wordComplexityScore: number;
  if (avgWordLength >= 4 && avgWordLength <= 7) {
    wordComplexityScore = 90;
  } else if (avgWordLength > 7) {
    wordComplexityScore = Math.max(40, 90 - (avgWordLength - 7) * 10);
  } else {
    wordComplexityScore = Math.max(50, 90 - (4 - avgWordLength) * 10);
  }
  wordComplexityScore = clampScore(wordComplexityScore);

  // Component 3: Average words per sentence
  const avgWordsPerSentence = words.length / sentences.length;
  let avgWordsPerSentenceScore: number;
  if (avgWordsPerSentence >= IDEAL_SENTENCE_MIN && avgWordsPerSentence <= IDEAL_SENTENCE_MAX) {
    avgWordsPerSentenceScore = 95;
  } else if (avgWordsPerSentence > MAX_SENTENCE_LENGTH) {
    avgWordsPerSentenceScore = Math.max(30, 95 - (avgWordsPerSentence - MAX_SENTENCE_LENGTH) * 3);
  } else if (avgWordsPerSentence < IDEAL_SENTENCE_MIN) {
    avgWordsPerSentenceScore = Math.max(40, 95 - (IDEAL_SENTENCE_MIN - avgWordsPerSentence) * 5);
  } else {
    avgWordsPerSentenceScore = 80;
  }
  avgWordsPerSentenceScore = clampScore(avgWordsPerSentenceScore);

  // Component 4: Text volume — more text = more readable content
  const textVolume = normalized.normalizedText.length;
  let textVolumeScore: number;
  if (textVolume > 2000) {
    textVolumeScore = 95;
  } else if (textVolume > 500) {
    textVolumeScore = 80;
  } else if (textVolume > 100) {
    textVolumeScore = 60;
  } else {
    textVolumeScore = 30;
  }
  textVolumeScore = clampScore(textVolumeScore);

  // Weighted sum
  const components = {
    sentenceLengthScore,
    wordComplexityScore,
    avgWordsPerSentenceScore,
    textVolumeScore,
  };

  let score = 0;
  for (const [key, value] of Object.entries(components)) {
    score += value * COMPONENT_WEIGHTS[key as keyof typeof COMPONENT_WEIGHTS];
  }
  score = clampScore(score);

  // Apply contamination penalty
  const contaminationResult = applyContaminationPenalty(score, ctx, ["script_only_dom", "encoding_failure"]);
  score = clampScore(contaminationResult.score);

  // Confidence model
  let confidence = 0.85;
  confidence -= tooLongCount * 0.02;
  confidence = Math.max(0.3, confidence);
  confidence = applyContaminationConfidence(confidence, ctx);

  // Evidence excerpts
  const evidence: string[] = [
    `${sentences.length} sentences, ${words.length} words`,
    `Average words per sentence: ${avgWordsPerSentence.toFixed(1)}`,
    `Average word length: ${avgWordLength.toFixed(1)} chars`,
    `Text volume: ${textVolume} chars`,
  ];
  if (tooLongCount > 0) {
    evidence.push(`${tooLongCount} sentences exceed ${MAX_SENTENCE_LENGTH} words`);
  }

  // Weaknesses
  const weaknesses: string[] = [];
  if (tooLongCount > 0) {
    weaknesses.push(`${tooLongCount} sentences are too long (>${MAX_SENTENCE_LENGTH} words)`);
  }
  if (avgWordsPerSentence > MAX_SENTENCE_LENGTH) {
    weaknesses.push(`Average sentence length (${avgWordsPerSentence.toFixed(1)}) is excessive`);
  }
  if (avgWordLength > 7) {
    weaknesses.push(`High average word length (${avgWordLength.toFixed(1)}) suggests complex vocabulary`);
  }
  if (textVolume < 100) {
    weaknesses.push("Very low text volume — insufficient content for readability assessment");
  }
  if (contaminationResult.flags.length > 0) {
    weaknesses.push(`Contamination impact: ${contaminationResult.flags.join(", ")}`);
  }

  // Recommendations
  const recommendations = [];
  let recIndex = 0;
  if (tooLongCount > 0 || avgWordsPerSentence > MAX_SENTENCE_LENGTH) {
    recommendations.push(REC_TEMPLATES.content.improveReadability("readability", recIndex++));
  }
  if (textVolume < 100) {
    recommendations.push(REC_TEMPLATES.content.addContent("readability", recIndex++));
  }
  if (avgWordLength > 7) {
    recommendations.push(rec("readability", "content", "low", "Simplify vocabulary — use shorter, more common words where possible.", recIndex++));
  }

  return createScoredResult(
    "readability",
    score,
    confidence,
    evidence,
    weaknesses,
    recommendations,
    {
      inputs: {
        sentenceCount: sentences.length,
        wordCount: words.length,
        avgWordsPerSentence: Math.round(avgWordsPerSentence * 100) / 100,
        avgWordLength: Math.round(avgWordLength * 100) / 100,
        textVolume,
        tooLongCount,
      },
      components,
      formula: buildFormula(COMPONENT_WEIGHTS, score),
      result: score,
    },
  );
}
