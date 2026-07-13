/**
 * Benchmark Runner — Phase 6 (Puppeteer Fallback Edition)
 * Adds:
 *  - async HTML fetching in live mode
 *  - Puppeteer fallback when fetch() fails
 *  - regression mode unchanged
 */

import type {
  BenchmarkCorpus,
  BenchmarkCase,
  BenchmarkResult,
  ACEScore,
  AceReport,
  AceSummaryReport,
} from "@/types";

import { extractEvidenceFromHtmlString } from "@/modules/evidence";
import { normalizeEvidence } from "@/modules/normalization";
import { scoreNormalizedEvidence } from "@/modules/scoring";
import { generateAceReport, generateSummaryReport } from "@/modules/reporting";

import puppeteer from "puppeteer";

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
 * Global Puppeteer browser instance — reused for all cases.
 */
let browser: puppeteer.Browser | null = null;

/**
 * Fetch HTML with fallback:
 * 1. Try native fetch()
 * 2. If that fails, use Puppeteer
 */
async function fetchHtmlWithFallback(url: string): Promise<string | null> {
  // First attempt: native fetch
  try {
    const res = await fetch(url);
    return await res.text();
  } catch (err) {
    // Continue to Puppeteer fallback
  }

  // Second attempt: Puppeteer
  try {
    if (!browser) {
      browser = await puppeteer.launch({
        headless: "new",
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }

    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
    const html = await page.content();
    await page.close();
    return html;
  } catch (err) {
    return null;
  }
}

/**
 * Run a single benchmark case through the full ACE pipeline.
 */
export async function runBenchmarkCase(
  c: BenchmarkCase,
  mode: "regression" | "live",
): Promise<BenchmarkResult> {
  const startTime = performance.now();

  try {
    let html: string | null = null;
    let url: string = c.url ?? `snapshot://${c.id}`;

    if (mode === "regression" && c.snapshotHtml) {
      html = c.snapshotHtml;
    } else if (mode === "live") {
      html = await fetchHtmlWithFallback(url);

      if (!html) {
        return {
          caseId: c.id,
          category: c.category,
          mode,
          score: null,
          report: null,
          summary: null,
          status: "error",
          errorMessage: `HTML fetch failed for ${url}`,
          executionTimeMs: Math.round(performance.now() - startTime),
        };
      }
    } else {
      html = c.snapshotHtml ?? "";
    }

    const { score, report, summary } = activePipeline(html, url);

    return {
      caseId: c.id,
      category: c.category,
      mode,
      score,
      report,
      summary,
      status: "ok",
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  } catch (err) {
    return {
      caseId: c.id,
      category: c.category,
      mode,
      score: null,
      report: null,
      summary: null,
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Unknown benchmark error",
      executionTimeMs: Math.round(performance.now() - startTime),
    };
  }
}

/**
 * Run all cases in a corpus sequentially.
 */
export async function runBenchmarkCorpus(
  corpus: BenchmarkCorpus,
  mode: "regression" | "live",
  onProgress?: (completed: number, total: number, caseId: string) => void,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = [];
  const total = corpus.cases.length;

  for (let i = 0; i < total; i++) {
    const c = corpus.cases[i];
    const result = await runBenchmarkCase(c, mode);
    results.push(result);
    onProgress?.(i + 1, total, c.id);
  }

  return results;
}

/**
 * Run corpus with concurrency.
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

  for (let i = 0; i < total; i += concurrency) {
    const batch = corpus.cases.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((c) => runBenchmarkCase(c, mode)));

    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
      completed++;
      onProgress?.(completed, total, batch[j].id);
    }
  }

  return results;
}

/**
 * Cleanup Puppeteer browser after run.
 */
export async function closeBenchmarkResources(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
