/**
 * Benchmark Runner — Phase 6
 * Runs the ACE pipeline per benchmark case.
 * Supports both Regression Mode (snapshots) and Live Mode (URLs).
 * Continues on failures — never aborts the corpus.
 */

import type {
  BenchmarkCorpus,
  BenchmarkCase,
  BenchmarkResult,
  ACEScore,
  AceReport,
  AceSummaryReport,
  AceEvidenceResult,
  NormalizedEvidenceResult,
} from "@/types";

import { extractEvidenceFromHtmlString } from "@/modules/evidence";
import { normalizeEvidence } from "@/modules/normalization";
import { scoreNormalizedEvidence } from "@/modules/scoring";
import { generateAceReport, generateSummaryReport } from "@/modules/reporting";

/**
 * Pipeline function type — runs evidence extraction → normalization → scoring → reporting.
 * Injectable for testability (bypasses DOMParser dependency in Node test env).
 */
export type BenchmarkPipelineFn = (
  html: string,
  url: string,
) => {
  score: ACEScore;
  report: AceReport;
  summary: AceSummaryReport;
};

/** Default pipeline using the real ACE engine. */
const defaultPipeline: BenchmarkPipelineFn = (html, url) => {
  const evidence = extractEvidenceFromHtmlString(html, url);
  const normalized = normalizeEvidence(evidence);
  const score = scoreNormalizedEvidence(normalized);
  const report = generateAceReport(score, normalized);
  const summary = generateSummaryReport(score);
  return { score, report, summary };
};

/** Cache of pipeline functions per corpus run (for test injection). */
let activePipeline: BenchmarkPipelineFn = defaultPipeline;

/**
 * Set the active pipeline function (for testing).
 * Pass a mock pipeline to bypass DOMParser dependency.
 * @param fn Pipeline function to use, or null to reset to default.
 */
export function setBenchmarkPipeline(fn: BenchmarkPipelineFn | null): void {
  activePipeline = fn ?? defaultPipeline;
}

/**
 * Create a mock pipeline from pre-built evidence results.
 * Useful for testing without DOMParser.
 * @param evidenceMap Map of caseId → AceEvidenceResult.
 * @returns Pipeline function that uses the pre-built evidence.
 */
export function createMockPipeline(
  evidenceMap: Map<string, AceEvidenceResult>,
): BenchmarkPipelineFn {
  return (_html: string, url: string) => {
    // Find evidence by URL match or use a default
    let evidence: AceEvidenceResult | undefined;
    for (const [_, ev] of evidenceMap) {
      if (ev.url === url) {
        evidence = ev;
        break;
      }
    }
    if (!evidence) {
      throw new Error(`No mock evidence for URL: ${url}`);
    }
    const normalized = normalizeEvidence(evidence);
    const score = scoreNormalizedEvidence(normalized);
    const report = generateAceReport(score, normalized);
    const summary = generateSummaryReport(score);
    return { score, report, summary };
  };
}

/**
 * Create a mock pipeline from pre-built normalized evidence.
 * @param normalizedMap Map of caseId → NormalizedEvidenceResult.
 */
export function createMockNormalizedPipeline(
  normalizedMap: Map<string, NormalizedEvidenceResult>,
): BenchmarkPipelineFn {
  return (_html: string, url: string) => {
    // Find by URL
    let normalized: NormalizedEvidenceResult | undefined;
    for (const [_, norm] of normalizedMap) {
      if (norm.url === url) {
        normalized = norm;
        break;
      }
    }
    if (!normalized) {
      throw new Error(`No mock normalized evidence for URL: ${url}`);
    }
    const score = scoreNormalizedEvidence(normalized);
    const report = generateAceReport(score, normalized);
    const summary = generateSummaryReport(score);
    return { score, report, summary };
  };
}

/**
 * Create a mock pipeline from pre-built ACEScore objects.
 * Bypasses the entire pipeline — just uses the score directly.
 * @param scoreMap Map of caseId → ACEScore.
 */
export function createMockScorePipeline(
  scoreMap: Map<string, ACEScore>,
): BenchmarkPipelineFn {
  return (_html: string, url: string) => {
    // Find by URL in scoreMap values
    let score: ACEScore | undefined;
    for (const [_, s] of scoreMap) {
      if (s.url === url) {
        score = s;
        break;
      }
    }
    if (!score) {
      throw new Error(`No mock score for URL: ${url}`);
    }
    // Create a minimal normalized result for report generation
    const normalized: NormalizedEvidenceResult = {
      url: score.url,
      timestamp: score.timestamp,
      normalizedText: "",
      headings: [], paragraphs: [], lists: [], tables: [], links: [],
      semantic: [], semanticStructure: [], structuredContent: [],
      domainProfile: [], entities: [], accessibility: [], structuredData: [],
      extractability: [], redundancy: [], absence: [],
      hierarchy: null,
      contamination: score.diagnostics.contamination,
      contaminationType: score.diagnostics.contaminationType,
      normalizedSentences: [], normalizedWords: [],
      normalizedParagraphTokens: [], normalizedListTokens: [], normalizedTableTokens: [],
      normalizationWarnings: score.diagnostics.normalizationWarnings,
      normalizationErrors: [],
    };
    const report = generateAceReport(score, normalized);
    const summary = generateSummaryReport(score);
    return { score, report, summary };
  };
}

/**
 * Run a single benchmark case through the full ACE pipeline.
 * Evidence extraction → Normalization → Scoring → Reporting
 *
 * @param c The benchmark case to run.
 * @param mode Benchmark mode (regression or live).
 * @returns BenchmarkResult with score, report, summary, and timing.
 */
export function runBenchmarkCase(
  c: BenchmarkCase,
  mode: "regression" | "live",
): BenchmarkResult {
  const startTime = performance.now();

  try {
    // Get HTML content — from snapshot (regression) or fetch (live)
    let html: string;
    let url: string;

    if (mode === "regression" && c.snapshotHtml) {
      html = c.snapshotHtml;
      url = c.url ?? `snapshot://${c.id}`;
    } else if (c.url) {
      if (c.snapshotHtml) {
        html = c.snapshotHtml;
        url = c.url;
      } else {
        throw new Error(`Live mode requires URL or snapshot — no content for case ${c.id}`);
      }
    } else {
      throw new Error(`No content available for case ${c.id}`);
    }

    // Run the active pipeline (default or injected mock)
    const { score, report, summary } = activePipeline(html, url);

    const executionTimeMs = Math.round(performance.now() - startTime);

    return {
      caseId: c.id,
      category: c.category,
      mode,
      score,
      report,
      summary,
      status: "ok",
      executionTimeMs,
    };
  } catch (err) {
    const executionTimeMs = Math.round(performance.now() - startTime);
    const errorMessage = err instanceof Error ? err.message : "Unknown benchmark error";

    return {
      caseId: c.id,
      category: c.category,
      mode,
      score: null,
      report: null,
      summary: null,
      status: "error",
      errorMessage,
      executionTimeMs,
    };
  }
}

/**
 * Run all cases in a corpus through the ACE pipeline.
 * Continues on failures — each failure is recorded but does not abort the run.
 *
 * @param corpus The benchmark corpus to run.
 * @param mode Benchmark mode (regression or live).
 * @param onProgress Optional progress callback.
 * @returns Array of benchmark results.
 */
export function runBenchmarkCorpus(
  corpus: BenchmarkCorpus,
  mode: "regression" | "live",
  onProgress?: (completed: number, total: number, caseId: string) => void,
): BenchmarkResult[] {
  const results: BenchmarkResult[] = [];
  const total = corpus.cases.length;

  for (let i = 0; i < corpus.cases.length; i++) {
    const c = corpus.cases[i];
    const result = runBenchmarkCase(c, mode);
    results.push(result);
    onProgress?.(i + 1, total, c.id);
  }

  return results;
}

/**
 * Run a benchmark corpus asynchronously with optional concurrency.
 * Results are collected deterministically regardless of execution order.
 *
 * @param corpus The benchmark corpus to run.
 * @param mode Benchmark mode.
 * @param concurrency Number of concurrent cases (default 1 = sequential).
 * @param onProgress Optional progress callback.
 * @returns Promise resolving to array of benchmark results.
 */
export async function runBenchmarkCorpusAsync(
  corpus: BenchmarkCorpus,
  mode: "regression" | "live",
  concurrency: number = 1,
  onProgress?: (completed: number, total: number, caseId: string) => void,
): Promise<BenchmarkResult[]> {
  const total = corpus.cases.length;
  const results: BenchmarkResult[] = new Array(total);
  let completed = 0;

  // Process in batches based on concurrency
  for (let i = 0; i < corpus.cases.length; i += concurrency) {
    const batch = corpus.cases.slice(i, i + concurrency);
    const batchPromises = batch.map((c) =>
      Promise.resolve().then(() => runBenchmarkCase(c, mode)),
    );

    const batchResults = await Promise.all(batchPromises);

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
      completed++;
      onProgress?.(completed, total, batch[j].id);
    }
  }

  return results;
}
