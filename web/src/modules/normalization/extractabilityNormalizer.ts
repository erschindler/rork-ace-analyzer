/**
 * Extractability Normalizer — Phase 3
 * Normalizes content density, noise ratio, boilerplate detection,
 * and extractable vs non-extractable regions.
 */

import type { AceEvidenceResult, NormalizedSection, NormalizedSignal } from "@/types";
import { normalizeSection } from "./structureNormalizer";

/** Minimum content density to be considered extractable. */
const MIN_CONTENT_DENSITY = 0.3;

/** Maximum noise ratio to be considered extractable. */
const MAX_NOISE_RATIO = 0.7;

/**
 * Normalize extractability evidence.
 * @param evidence Source evidence result.
 * @param isContaminated Whether evidence is contaminated.
 * @returns Normalized extractability sections.
 */
export function normalizeExtractability(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections: NormalizedSection[] = [];

  for (const section of evidence.extractability) {
    const normalized = normalizeSection(section, "extractability", isContaminated);

    // Normalize extractability signals with standardized metrics
    normalized.normalizedSignals = normalized.normalizedSignals.map((sig) => {
      switch (sig.type) {
        case "content_density":
          return normalizeContentDensity(sig);
        case "noise_ratio":
          return normalizeNoiseRatio(sig);
        case "repeated_blocks":
          return normalizeRepeatedBlocks(sig);
        case "boilerplate_detection":
          return normalizeBoilerplate(sig);
        case "extractable_region":
          return normalizeExtractableRegion(sig);
        default:
          return sig;
      }
    });

    // Calculate overall extractability score
    const signals = normalized.normalizedSignals;
    const densitySignal = signals.find((s) => s.type === "content_density");
    const noiseSignal = signals.find((s) => s.type === "noise_ratio");

    const density = (densitySignal?.metadata?.contentDensity as number) ?? 0;
    const noise = (noiseSignal?.metadata?.noiseRatio as number) ?? 1;
    const isExtractable = density >= MIN_CONTENT_DENSITY && noise < MAX_NOISE_RATIO && !isContaminated;

    // Add overall extractability assessment
    normalized.normalizedSignals.push({
      type: "extractability_assessment",
      value: isExtractable ? "extractable" : "non_extractable",
      confidence: isExtractable ? 0.9 : 0.3,
      selector: "body",
      metadata: {
        overallExtractability: isExtractable,
        contentDensity: density,
        noiseRatio: noise,
        contaminationImpact: isContaminated,
        threshold: {
          minContentDensity: MIN_CONTENT_DENSITY,
          maxNoiseRatio: MAX_NOISE_RATIO,
        },
      },
      isContaminated,
    });

    normalized.normalizedContent = normalized.normalizedSignals
      .map((s) => `${s.type}: ${s.value}`)
      .join("; ");

    sections.push(normalized);
  }

  return sections;
}

/**
 * Normalize content density signal.
 */
function normalizeContentDensity(sig: NormalizedSignal): NormalizedSignal {
  const density = (sig.metadata?.contentDensity as number) ?? 0;
  const fullLength = (sig.metadata?.fullTextLength as number) ?? 0;
  const mainLength = (sig.metadata?.mainTextLength as number) ?? 0;

  return {
    ...sig,
    value: `${(density * 100).toFixed(1)}%`,
    confidence: fullLength > 0 ? 0.9 : 0.3,
    metadata: {
      ...sig.metadata,
      contentDensity: Math.round(density * 10000) / 10000,
      fullTextLength: fullLength,
      mainTextLength: mainLength,
      isExtractable: density >= MIN_CONTENT_DENSITY,
      metric: "content_density",
    },
  };
}

/**
 * Normalize noise ratio signal.
 */
function normalizeNoiseRatio(sig: NormalizedSignal): NormalizedSignal {
  const ratio = (sig.metadata?.noiseRatio as number) ?? 0;
  const noiseLength = (sig.metadata?.noiseTextLength as number) ?? 0;

  return {
    ...sig,
    value: `${(ratio * 100).toFixed(1)}%`,
    confidence: 0.85,
    metadata: {
      ...sig.metadata,
      noiseRatio: Math.round(ratio * 10000) / 10000,
      noiseTextLength: noiseLength,
      isHighNoise: ratio > 0.5,
      isCriticalNoise: ratio > MAX_NOISE_RATIO,
      metric: "noise_ratio",
    },
  };
}

/**
 * Normalize repeated blocks signal.
 */
function normalizeRepeatedBlocks(sig: NormalizedSignal): NormalizedSignal {
  const repeated = (sig.metadata?.repeatedBlocks as number) ?? 0;
  const total = (sig.metadata?.totalBlocks as number) ?? 0;
  const ratio = total > 0 ? repeated / total : 0;

  return {
    ...sig,
    value: `${repeated} repeated blocks (${(ratio * 100).toFixed(1)}% of ${total})`,
    confidence: 0.8,
    metadata: {
      ...sig.metadata,
      repeatedBlocks: repeated,
      totalBlocks: total,
      repetitionRatio: Math.round(ratio * 10000) / 10000,
      hasSignificantRepetition: ratio > 0.1,
      metric: "repeated_blocks",
    },
  };
}

/**
 * Normalize boilerplate detection signal.
 */
function normalizeBoilerplate(sig: NormalizedSignal): NormalizedSignal {
  const count = (sig.metadata?.boilerplateElements as number) ?? 0;

  return {
    ...sig,
    value: `${count} boilerplate regions`,
    confidence: 0.75,
    metadata: {
      ...sig.metadata,
      boilerplateElements: count,
      hasSignificantBoilerplate: count >= 3,
      metric: "boilerplate_detection",
    },
  };
}

/**
 * Normalize extractable region signal.
 */
function normalizeExtractableRegion(sig: NormalizedSignal): NormalizedSignal {
  const textLength = (sig.metadata?.textLength as number) ?? 0;
  const tag = (sig.metadata?.tag as string) ?? "unknown";

  return {
    ...sig,
    value: `${tag} (${textLength} chars)`,
    confidence: textLength > 50 ? 0.85 : 0.4,
    metadata: {
      ...sig.metadata,
      textLength,
      tag,
      hasContent: textLength > 50,
      metric: "extractable_region",
    },
  };
}
