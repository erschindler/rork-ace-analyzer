/**
 * Normalization Orchestrator — Phase 3
 * Imports all normalization modules, runs them in deterministic order,
 * handles all known failure modes, assembles a complete NormalizedEvidenceResult.
 * Never throws — always returns a valid object.
 */

import type {
  AceEvidenceResult,
  NormalizedEvidenceResult,
  NormalizedSection,
  NormalizedHierarchyNode,
} from "@/types";

import { resetSectionIdCounter } from "./structureNormalizer";
import {
  normalizeText,
  normalizeSentences,
  normalizeWords,
  tokenizeParagraphs,
  tokenizeListItems,
  tokenizeTableRows,
  buildNormalizedText,
} from "./textNormalizer";
import {
  normalizeSections,
  normalizeHeadingLevels,
} from "./structureNormalizer";
import {
  normalizeSemanticHtml,
  normalizeSemanticStructure,
} from "./semanticNormalizer";
import { normalizeStructuredContent } from "./structuredContentNormalizer";
import { normalizeDomainProfile } from "./domainProfileNormalizer";
import { normalizeExtractability } from "./extractabilityNormalizer";
import { normalizeRedundancy } from "./redundancyNormalizer";
import { normalizeAnchorText } from "./anchorTextNormalizer";
import { normalizeAccessibility } from "./accessibilityNormalizer";
import { normalizeStructuredData } from "./structuredDataNormalizer";
import { normalizeEntities } from "./entityNormalizer";
import { normalizeHierarchy, detectHierarchyIssues } from "./hierarchyNormalizer";
import { normalizeAbsence } from "./absenceNormalizer";
import { normalizeContamination, isCriticalContamination } from "./contaminationNormalizer";
import { createDiagnostics, type NormalizationDiagnostics } from "./normalizationDiagnostics";

/**
 * Create an empty normalized evidence result for failure cases.
 * @param url Source URL.
 * @param warnings Array of warning messages.
 * @param errors Array of error messages.
 * @returns Empty NormalizedEvidenceResult.
 */
export function createEmptyNormalizedResult(
  url: string,
  warnings: string[] = [],
  errors: string[] = [],
): NormalizedEvidenceResult {
  return {
    url,
    timestamp: Date.now(),
    normalizedText: "",
    headings: [],
    paragraphs: [],
    lists: [],
    tables: [],
    links: [],
    semantic: [],
    semanticStructure: [],
    structuredContent: [],
    domainProfile: [],
    entities: [],
    accessibility: [],
    structuredData: [],
    extractability: [],
    redundancy: [],
    absence: [],
    hierarchy: null,
    contamination: true,
    contaminationType: "normalization_failure",
    normalizedSentences: [],
    normalizedWords: [],
    normalizedParagraphTokens: [],
    normalizedListTokens: [],
    normalizedTableTokens: [],
    normalizationWarnings: warnings,
    normalizationErrors: errors,
  };
}

/**
 * Normalize evidence from an AceEvidenceResult.
 * This is the core normalization function that runs all normalizers in deterministic order.
 *
 * ACE v1.2 Contamination Propagation:
 * If evidence.contamination is true AND the contamination is critical (blocks scoring),
 * normalization skips all computation and returns a minimal object with
 * contamination = true and contaminationType propagated from evidence.
 * Non-critical contamination (shadow_dom, boilerplate_only, etc.) still runs
 * normalization but flags the result as contaminated.
 *
 * @param evidence Source evidence result from Phase 2.
 * @returns Complete NormalizedEvidenceResult.
 */
export function normalizeEvidence(
  evidence: AceEvidenceResult,
): NormalizedEvidenceResult {
  const diagnostics = createDiagnostics();
  const url = evidence.url;
  const timestamp = Date.now();

  // Reset section ID counter for deterministic output
  resetSectionIdCounter();

  // Determine contamination status
  const isContaminated = evidence.contamination;
  const contaminationType = evidence.contaminationType;
  const isCritical = isCriticalContamination(contaminationType) || evidence.diagnostics?.domCorruption === true;

  if (isContaminated) {
    diagnostics.addWarning(
      `Evidence is contaminated: ${contaminationType ?? "unknown type"}`,
      "contamination",
    );
  }

  // ─── ACE v1.2: Block normalization when critical contamination is present ───
  // If contamination is critical (fetch_failure, hydration_shell, script_only_dom,
  // dom_corruption), skip all normalization computation and return minimal object.
  if (isContaminated && isCritical) {
    diagnostics.addDegraded(
      `Critical contamination (${contaminationType}) — skipping normalization computation`,
      "orchestrator",
    );
    const result = createContaminatedNormalizedResult(
      url,
      contaminationType,
      diagnostics.getWarnings(),
      diagnostics.getErrors(),
    );
    result.timestamp = timestamp;
    return result;
  }

  // Handle empty/contaminated evidence (non-critical contamination still normalizes)
  const hasContent = checkHasContent(evidence);
  if (!hasContent) {
    diagnostics.addDegraded("No content detected in evidence — returning empty normalized result", "orchestrator");
    const result = createEmptyNormalizedResult(url, diagnostics.getWarnings(), diagnostics.getErrors());
    result.timestamp = timestamp;
    // Propagate contamination even for empty results
    if (isContaminated) {
      result.contamination = true;
      result.contaminationType = contaminationType;
    }
    return result;
  }

  try {
    // Step 1: Normalize contamination metadata
    const contaminationResult = safeNormalize(
      () => normalizeContamination(evidence, isContaminated),
      "contamination",
      diagnostics,
    );

    // Add contamination warnings
    if (contaminationResult) {
      diagnostics.addWarnings(contaminationResult.warnings, "contamination");
    }

    // Step 2: Normalize structural sections
    const headings = safeNormalize(
      () => normalizeHeadings(evidence, isContaminated),
      "headings",
      diagnostics,
    );
    const paragraphs = safeNormalize(
      () => normalizeParagraphs(evidence, isContaminated),
      "paragraphs",
      diagnostics,
    );
    const lists = safeNormalize(
      () => normalizeLists(evidence, isContaminated),
      "lists",
      diagnostics,
    );
    const tables = safeNormalize(
      () => normalizeTables(evidence, isContaminated),
      "tables",
      diagnostics,
    );
    const links = safeNormalize(
      () => normalizeLinks(evidence, isContaminated),
      "links",
      diagnostics,
    );

    // Step 3: Normalize semantic sections
    const semantic = safeNormalize(
      () => normalizeSemanticHtml(evidence, isContaminated),
      "semantic",
      diagnostics,
    );
    const semanticStructure = safeNormalize(
      () => normalizeSemanticStructure(evidence, isContaminated),
      "semanticStructure",
      diagnostics,
    );

    // Step 4: Normalize analytical sections
    const structuredContent = safeNormalize(
      () => normalizeStructuredContent(evidence, isContaminated),
      "structuredContent",
      diagnostics,
    );
    const domainProfile = safeNormalize(
      () => normalizeDomainProfile(evidence, isContaminated),
      "domainProfile",
      diagnostics,
    );
    const entities = safeNormalize(
      () => normalizeEntities(evidence, isContaminated),
      "entities",
      diagnostics,
    );

    // Step 5: Normalize accessibility and structured data
    const accessibility = safeNormalize(
      () => normalizeAccessibility(evidence, isContaminated),
      "accessibility",
      diagnostics,
    );
    const structuredData = safeNormalize(
      () => normalizeStructuredData(evidence, isContaminated),
      "structuredData",
      diagnostics,
    );

    // Step 6: Normalize extractability and redundancy
    const extractability = safeNormalize(
      () => normalizeExtractability(evidence, isContaminated),
      "extractability",
      diagnostics,
    );
    const redundancy = safeNormalize(
      () => normalizeRedundancy(evidence, isContaminated),
      "redundancy",
      diagnostics,
    );

    // Step 7: Normalize absence
    const absence = safeNormalize(
      () => normalizeAbsence(evidence, isContaminated),
      "absence",
      diagnostics,
    );

    // Step 8: Normalize hierarchy
    const hierarchy = safeNormalize(
      () => normalizeHierarchy(evidence.hierarchy, isContaminated),
      "hierarchy",
      diagnostics,
    );

    // Check hierarchy issues
    if (hierarchy) {
      const hierarchyIssues = detectHierarchyIssues(hierarchy);
      for (const issue of hierarchyIssues) {
        diagnostics.addWarning(`Hierarchy issue: ${issue}`, "hierarchy");
      }
    }

    // Collect all normalized sections for text building
    const allSections: NormalizedSection[] = [
      ...(headings ?? []),
      ...(paragraphs ?? []),
      ...(lists ?? []),
      ...(tables ?? []),
      ...(links ?? []),
      ...(semantic ?? []),
      ...(semanticStructure ?? []),
      ...(structuredContent ?? []),
      ...(domainProfile ?? []),
      ...(entities ?? []),
      ...(accessibility ?? []),
      ...(structuredData ?? []),
    ];

    // Step 9: Build normalized text
    // ACE v1.2 fix: Use the raw visible body text from the evidence result
    // as the primary source for normalizedText. This ensures word counts,
    // sentence counts, and readability metrics reflect the ACTUAL page content,
    // not just the truncated signal values from individual extractors.
    // Signal values are truncated (e.g. 300-500 chars per heading/paragraph)
    // which caused normalizedText to be a tiny fraction of the real content.
    const rawVisibleText = evidence.rawVisibleText ?? "";
    const sectionText = buildNormalizedTextFromSections(allSections ?? []);
    // Use rawVisibleText as the primary text; fall back to section text if empty
    const normalizedText = rawVisibleText.length > 0
      ? normalizeText(rawVisibleText, { normalizeWhitespace: true, stripControlChars: true, fixEncoding: true })
      : sectionText;

    // ACE v1.2: Check for mid-sentence/mid-word truncation in normalized text.
    // If normalized text ends mid-sentence, flag as contamination.
    if (normalizedText.length > 100) {
      const lastChar = normalizedText[normalizedText.length - 1];
      const tail = normalizedText.substring(Math.max(0, normalizedText.length - 80));
      if (![".", "!", "?", ":", ";", ")", "]", "}"].includes(lastChar) && !/[.!?]/.test(tail)) {
        diagnostics.addWarning(
          "Normalized text ends mid-sentence — content may be truncated",
          "truncation",
        );
        if (!isContaminated) {
          // Mark as contaminated (non-critical) so reporting knows
          // content may be incomplete
        }
      }
    }

    // Step 10: Produce tokens
    const normalizedSentences = normalizeSentences(normalizedText);
    const normalizedWords = normalizeWords(normalizedText);

    // Paragraph tokens
    const paragraphTexts = (paragraphs ?? []).flatMap((s) =>
      s.normalizedSignals.map((sig) => sig.value),
    );
    const normalizedParagraphTokens = tokenizeParagraphs(paragraphTexts);

    // List tokens
    const listTexts = (lists ?? []).flatMap((s) =>
      s.normalizedSignals.flatMap((sig) => {
        const items = sig.metadata?.items as string[] | undefined;
        return items ?? [sig.value];
      }),
    );
    const normalizedListTokens = tokenizeListItems(listTexts);

    // Table tokens
    const tableTexts = (tables ?? []).flatMap((s) =>
      s.normalizedSignals.flatMap((sig) => {
        const rows = sig.metadata?.sampleRows as string[][] | undefined;
        return rows?.map((r) => r.join(" ")) ?? [sig.value];
      }),
    );
    const normalizedTableTokens = tokenizeTableRows(tableTexts);

    // Step 11: Assemble final result
    const result: NormalizedEvidenceResult = {
      url,
      timestamp,
      normalizedText,
      headings: headings ?? [],
      paragraphs: paragraphs ?? [],
      lists: lists ?? [],
      tables: tables ?? [],
      links: links ?? [],
      semantic: semantic ?? [],
      semanticStructure: semanticStructure ?? [],
      structuredContent: structuredContent ?? [],
      domainProfile: domainProfile ?? [],
      entities: entities ?? [],
      accessibility: accessibility ?? [],
      structuredData: structuredData ?? [],
      extractability: extractability ?? [],
      redundancy: redundancy ?? [],
      absence: absence ?? [],
      hierarchy: hierarchy ?? null,
      contamination: isContaminated,
      contaminationType: contaminationResult?.contaminationType ?? evidence.contaminationType,
      normalizedSentences,
      normalizedWords,
      normalizedParagraphTokens,
      normalizedListTokens,
      normalizedTableTokens,
      normalizationWarnings: diagnostics.getWarnings(),
      normalizationErrors: diagnostics.getErrors(),
    };

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Unknown normalization error";
    diagnostics.addError(errorMsg, "orchestrator");
    return createEmptyNormalizedResult(url, diagnostics.getWarnings(), diagnostics.getErrors());
  }
}

/**
 * Create a minimal normalized result for critical contamination cases.
 * ACE v1.2: When critical contamination is detected, normalization is skipped entirely.
 * The result carries contamination metadata but no computed fields.
 * @param url Source URL.
 * @param contaminationType Contamination type from evidence.
 * @param warnings Normalization warnings.
 * @param errors Normalization errors.
 * @returns Minimal NormalizedEvidenceResult with contamination propagated.
 */
function createContaminatedNormalizedResult(
  url: string,
  contaminationType: string | undefined,
  warnings: string[],
  errors: string[],
): NormalizedEvidenceResult {
  return {
    url,
    timestamp: Date.now(),
    normalizedText: "",
    headings: [],
    paragraphs: [],
    lists: [],
    tables: [],
    links: [],
    semantic: [],
    semanticStructure: [],
    structuredContent: [],
    domainProfile: [],
    entities: [],
    accessibility: [],
    structuredData: [],
    extractability: [],
    redundancy: [],
    absence: [],
    hierarchy: null,
    contamination: true,
    contaminationType: contaminationType ?? "unknown_contamination",
    normalizedSentences: [],
    normalizedWords: [],
    normalizedParagraphTokens: [],
    normalizedListTokens: [],
    normalizedTableTokens: [],
    normalizationWarnings: warnings,
    normalizationErrors: errors,
  };
}

/**
 * Normalize evidence specifically for scoring (Phase 4 input).
 * Same as normalizeEvidence but may apply scoring-specific transformations in the future.
 * @param evidence Source evidence result.
 * @returns Normalized evidence ready for scoring.
 */
export function normalizeForScoring(
  evidence: AceEvidenceResult,
): NormalizedEvidenceResult {
  return normalizeEvidence(evidence);
}

/**
 * Normalize evidence specifically for reporting (Phase 5 input).
 * Same as normalizeEvidence but may apply reporting-specific transformations in the future.
 * @param evidence Source evidence result.
 * @returns Normalized evidence ready for reporting.
 */
export function normalizeForReporting(
  evidence: AceEvidenceResult,
): NormalizedEvidenceResult {
  return normalizeEvidence(evidence);
}

/**
 * Get a summary of all normalized sections for quick inspection.
 * @param result The normalized evidence result.
 * @returns Object with section names and signal counts.
 */
export function getNormalizedSummary(
  result: NormalizedEvidenceResult,
): Record<string, number> {
  return {
    headings: countSignals(result.headings),
    paragraphs: countSignals(result.paragraphs),
    lists: countSignals(result.lists),
    tables: countSignals(result.tables),
    links: countSignals(result.links),
    semantic: countSignals(result.semantic),
    semanticStructure: countSignals(result.semanticStructure),
    structuredContent: countSignals(result.structuredContent),
    domainProfile: countSignals(result.domainProfile),
    entities: countSignals(result.entities),
    accessibility: countSignals(result.accessibility),
    structuredData: countSignals(result.structuredData),
    extractability: countSignals(result.extractability),
    redundancy: countSignals(result.redundancy),
    absence: countSignals(result.absence),
    normalizedSentences: result.normalizedSentences.length,
    normalizedWords: result.normalizedWords.length,
    warnings: result.normalizationWarnings.length,
    errors: result.normalizationErrors.length,
  };
}

// ─── Internal helpers ───────────────────────────────────────────────

/**
 * Count total signals across all sections in an array.
 */
function countSignals(sections: NormalizedSection[]): number {
  return sections.reduce((sum, s) => sum + s.normalizedSignals.length, 0);
}

/**
 * Check if the evidence has any content to normalize.
 */
function checkHasContent(evidence: AceEvidenceResult): boolean {
  const sections = [
    evidence.headings, evidence.paragraphs, evidence.lists, evidence.tables,
    evidence.links, evidence.semantic, evidence.semanticStructure,
    evidence.structuredContent, evidence.domainProfile, evidence.entities,
    evidence.accessibility, evidence.structuredData, evidence.extractability,
    evidence.redundancy, evidence.absence,
  ];
  return sections.some((s) => s.length > 0 && s.some((sec) => sec.signals.length > 0));
}

/**
 * Safely run a normalization function, catching errors and returning null on failure.
 */
function safeNormalize<T>(
  fn: () => T,
  sectionName: string,
  diagnostics: NormalizationDiagnostics,
): T | null {
  try {
    return fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    diagnostics.addError(`${sectionName}: ${msg}`, sectionName);
    return null;
  }
}

/**
 * Normalize headings section.
 */
function normalizeHeadings(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  const sections = normalizeSections(evidence.headings, "headings", isContaminated);
  for (const section of sections) {
    section.normalizedSignals = normalizeHeadingLevels(section.normalizedSignals);
  }
  return sections;
}

/**
 * Normalize paragraphs section.
 */
function normalizeParagraphs(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return normalizeSections(evidence.paragraphs, "paragraphs", isContaminated);
}

/**
 * Normalize lists section.
 */
function normalizeLists(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return normalizeSections(evidence.lists, "lists", isContaminated);
}

/**
 * Normalize tables section.
 */
function normalizeTables(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return normalizeSections(evidence.tables, "tables", isContaminated);
}

/**
 * Normalize links section.
 */
function normalizeLinks(
  evidence: AceEvidenceResult,
  isContaminated: boolean,
): NormalizedSection[] {
  return normalizeSections(evidence.links, "links", isContaminated);
}

/**
 * Build normalized text from all sections' content.
 */
function buildNormalizedTextFromSections(sections: NormalizedSection[]): string {
  const fragments: string[] = [];
  for (const section of sections) {
    if (section.normalizedContent) {
      fragments.push(section.normalizedContent);
    }
  }
  return buildNormalizedText(fragments);
}
