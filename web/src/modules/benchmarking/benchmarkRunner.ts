/**
 * Benchmark Runner — Phase 6 (Updated)
 * Adds async HTML fetching in live mode.
 * Regression mode unchanged.
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
 */
export type BenchmarkPipelineFn = (
  html: string,
  url: string,
) => {
  score: ACEScore;
  report: AceReport;
  summary: AceSummaryReport;
};

const defaultPipeline: BenchmarkPipelineFn = (html, url) => {
  const evidence = extractEvidenceFromHtmlString(html, url);
  const normalized = normalizeEvidence(evidence);
  const score = scoreNormalizedEvidence(normalized);
  const report = generateAceReport(score, normalized);
  const summary = generateSummaryReport(score);
  return { score, report, summary };
};

let activePipeline: BenchmarkPipelineFn = defaultPipeline;

export function setBenchmarkPipeline(fn: BenchmarkPipelineFn | null): void {
  activePipeline = fn ?? defaultPipeline;
}

/**
 * ⭐ UPDATED: runBenchmarkCase is now async
 */
export async function runBenchmarkCase(
  c: BenchmarkCase,
  mode: "regression" | "live",
): Promise<BenchmarkResult> {
  const startTime = performance.now();

  try {
    let html: string;
    let url: string;

    if (mode === "regression" && c.snapshotHtml) {
      html = c.snapshotHtml;
      url = c.url ?? `snapshot://${c.id}`;
    } else if (c.url) {
      url = c.url;

      if (mode === "live") {
        // ⭐ NEW: Always fetch HTML in live mode
        const res = await fetch(url);
        html = await res.text();
      } else {
        // fallback for regression mode
        html = c.snapshotHtml ?? "";
      }
    } else {
      throw new Error(`No content available for case ${c.id}`);
    }

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
 * ⭐ UPDATED: runBenchmarkCorpus is now async
 */
export async function runBenchmarkCorpus(
  corpus: BenchmarkCorpus,
  mode: "regression" | "live",
  onProgress?: (completed: number, total: number, caseId: string) => void,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const total = corpus.cases.length;

  for (let i = 0; i < corpus.cases.length; i++) {
    const c = corpus.cases[i];
    const result = await runBenchmarkCase(c, mode);
    results.push(result);
    onProgress?.(i + 1, total, c.id);
  }

  return results;
}

/**
 * ⭐ UPDATED: async concurrency runner stays async
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

  for (let i = 0; i < corpus.cases.length; i += concurrency) {
    const batch = corpus.cases.slice(i, i + concurrency);

    const batchPromises = batch.map((c) => runBenchmarkCase(c, mode));
    const batchResults = await Promise.all(batchPromises);

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
      completed++;
      onProgress?.(completed, total, batch[j].id);
    }
  }

  return results;
}
