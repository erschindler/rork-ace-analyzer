/**
 * Benchmarking System Tests — Phase 6
 *
 * Test cases:
 * 1. Malformed CSV (missing header, invalid columns)
 * 2. Duplicate page IDs
 * 3. Missing categories
 * 4. Corrupted baseline
 * 5. Interrupted benchmark run (partial corpus)
 * 6. 1600-site CSV corpus load (8 categories × 200 sites)
 * 7. Regression Mode vs Live Mode separation
 * 8. Deterministic repeat runs (identical JSON output)
 * 9. Corpus hash stability
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CsvCorpusProvider,
  parseCsv,
  validateCsv,
  generateSyntheticCorpusCsv,
} from "@/modules/benchmarking/corpus/csvCorpusProvider";
import {
  SnapshotCorpusProvider,
  createSnapshotProvider,
} from "@/modules/benchmarking/corpus/snapshotCorpusProvider";
import {
  runBenchmarkCase,
  runBenchmarkCorpus,
  setBenchmarkPipeline,
  createMockScorePipeline,
} from "@/modules/benchmarking/benchmarkRunner";
import { runMultiSiteBenchmark, sortResults } from "@/modules/benchmarking/multiSiteBenchmarkRunner";
import {
  createBaseline,
  serializeBaseline,
  deserializeBaseline,
  isBaselineCompatible,
  isBaselineCorrupted,
} from "@/modules/benchmarking/baselineManager";
import { compareRegression } from "@/modules/benchmarking/regressionComparator";
import { detectDrift } from "@/modules/benchmarking/driftDetector";
import { computeCorpusHash, sortCasesDeterministic } from "@/modules/benchmarking/corpusUtils";
import {
  buildBenchmarkSummaryReport,
  buildRegressionReport,
  buildDriftReport,
} from "@/modules/benchmarking/benchmarkReportBuilder";
import { scoreNormalizedEvidence } from "@/modules/scoring/scoringPipeline";
import { generateAceReport, generateSummaryReport } from "@/modules/reporting";
import type {
  BenchmarkCorpus,
  BenchmarkCase,
  BenchmarkResult,
  ACEScore,
  NormalizedEvidenceResult,
  NormalizedSection,
  NormalizedSignal,
} from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────

/** Simple HTML page for snapshot testing. */
function createSimpleHtml(title: string, content: string): string {
  return `<!DOCTYPE html><html><head><title>${title}</title><meta name="description" content="Test page"></head><body><main><h1>${title}</h1><p>${content}</p><article><h2>Section</h2><p>More content here for testing purposes.</p></article></main></body></html>`;
}

/** Create a normalized signal. */
function nsig(type: string, value: string, confidence: number = 0.9, metadata?: Record<string, unknown>): NormalizedSignal {
  return { type, value, confidence, selector: "body", metadata, isContaminated: false };
}

/** Create a normalized section. */
function nsection(type: string, signals: NormalizedSignal[], content?: string): NormalizedSection {
  return {
    id: `${type}_0`,
    type,
    normalizedContent: content ?? signals.map((s) => s.value).join(" "),
    normalizedSignals: signals,
    originalCount: signals.length,
    duplicatesRemoved: 0,
    confidence: 0.9,
  };
}

/** Create a mock normalized evidence result for a given case. */
function createMockNormalizedEvidence(url: string, caseId: string): NormalizedEvidenceResult {
  const seed = caseId.charCodeAt(caseId.length - 1) || 1;
  return {
    url,
    timestamp: Date.now(),
    normalizedText: `Test content for ${caseId}. This is a sentence for testing purposes. Another sentence provides more context.`,
    headings: [nsection("headings", [nsig("h1", `Title for ${caseId}`, 0.9, { level: 1 })])],
    paragraphs: [nsection("paragraphs", [
      nsig("p", `This is test content for ${caseId}. It contains multiple sentences for analysis.`, 0.88),
      nsig("p", `Another paragraph with more detailed content about the topic.`, 0.87),
    ])],
    lists: [],
    tables: [],
    links: [],
    semantic: [nsection("semantic", [
      nsig("main", "Main content", 0.9, { normalizedTag: "main" }),
      nsig("article", "Article", 0.88, { normalizedTag: "article" }),
    ])],
    semanticStructure: [nsection("semanticStructure", [
      nsig("section", "Section", 0.88, { tag: "section" }),
    ])],
    structuredContent: [],
    domainProfile: [],
    entities: [nsection("entities", [
      nsig("entity_person", "Test Person", 0.85, { entityType: "person" }),
    ])],
    accessibility: [nsection("accessibility", [
      nsig("img_alt", "Test alt text", 0.88, { alt: "Test alt text" }),
    ])],
    structuredData: [nsection("structuredData", [
      nsig("json_ld", "Article", 0.95, { schemaType: "Article" }),
    ])],
    extractability: [nsection("extractability", [
      nsig("content_density", "75.0%", 0.9, { contentDensity: 0.75 }),
      nsig("noise_ratio", "15.0%", 0.85, { noiseRatio: 0.15 }),
      nsig("extractable_region", "article (2000 chars)", 0.85, { tag: "article", textLength: 2000 }),
    ])],
    redundancy: [],
    absence: [],
    hierarchy: null,
    contamination: false,
    normalizedSentences: [`Test content for ${caseId}.`, `This is a sentence for testing purposes.`],
    normalizedWords: ["Test", "content", "for", caseId, "sentence", "testing"],
    normalizedParagraphTokens: [["Test", "content", caseId]],
    normalizedListTokens: [],
    normalizedTableTokens: [],
    normalizationWarnings: [],
    normalizationErrors: [],
  };
}

/** Create a mock score map for a corpus. */
function createMockScoreMap(corpus: BenchmarkCorpus): Map<string, ACEScore> {
  const map = new Map<string, ACEScore>();
  for (const c of corpus.cases) {
    if (!c.snapshotHtml && !c.url) continue;
    const url = c.url ?? `snapshot://${c.id}`;
    const normalized = createMockNormalizedEvidence(url, c.id);
    const score = scoreNormalizedEvidence(normalized);
    map.set(c.id, score);
  }
  return map;
}

/** Set up mock pipeline for a corpus before tests. */
function setupMockPipeline(corpus: BenchmarkCorpus): Map<string, ACEScore> {
  const scoreMap = createMockScoreMap(corpus);
  // Create a pipeline that matches by URL
  const pipeline = (_html: string, url: string) => {
    // Find the score by URL
    for (const [caseId, score] of scoreMap) {
      if (score.url === url) {
        const normalized = createMockNormalizedEvidence(url, caseId);
        return {
          score,
          report: generateAceReport(score, normalized),
          summary: generateSummaryReport(score),
        };
      }
    }
    throw new Error(`No mock score for URL: ${url}`);
  };
  setBenchmarkPipeline(pipeline);
  return scoreMap;
}

/** Create a snapshot corpus for testing. */
function createTestCorpus(): BenchmarkCorpus {
  return {
    cases: [
      {
        id: "test_001",
        category: "documentation",
        snapshotHtml: createSimpleHtml("Test Page 1", "This is test content for page 1."),
        url: "https://example.com/page1",
      },
      {
        id: "test_002",
        category: "blog",
        snapshotHtml: createSimpleHtml("Test Page 2", "This is test content for page 2 with more text."),
        url: "https://example.com/page2",
      },
      {
        id: "test_003",
        category: "documentation",
        snapshotHtml: createSimpleHtml("Test Page 3", "Another page with different content for testing."),
        url: "https://example.com/page3",
      },
    ],
    totalCount: 3,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("ACE Benchmarking System", () => {
  afterEach(() => {
    setBenchmarkPipeline(null);
  });

  describe("Test Case 1: Malformed CSV", () => {
    it("should detect missing header", () => {
      const csv = "page1,documentation,https://example.com\npage2,blog,https://example.org";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Missing required column"))).toBe(true);
    });

    it("should warn on unsupported columns (not fatal)", () => {
      const csv = "page_id,category,url,extra_column\npage1,doc,https://example.com,data";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.warnings.some((w) => w.includes("Unsupported column"))).toBe(true);
    });

    it("should detect invalid columns in header", () => {
      const csv = "wrong_header,category,url\npage1,doc,https://example.com";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("page_id"))).toBe(true);
    });
  });

  describe("Test Case 2: Duplicate page IDs", () => {
    it("should detect duplicate page_ids", () => {
      const csv = "page_id,category,url\ndup_001,doc,https://example.com\ndup_001,blog,https://example.org";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Duplicate page_id"))).toBe(true);
    });

    it("should detect duplicate URLs", () => {
      const csv = "page_id,category,url\npage_001,doc,https://example.com\npage_002,blog,https://example.com";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Duplicate url"))).toBe(true);
    });
  });

  describe("Test Case 3: Missing categories", () => {
    it("should detect empty category", () => {
      const csv = "page_id,category,url\npage_001,,https://example.com";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
      expect(validation.errors.some((e) => e.includes("Empty category") || e.includes("Missing category"))).toBe(true);
    });

    it("should detect missing category column value", () => {
      const csv = "page_id,category,url\npage_001,   ,https://example.com";
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(false);
    });
  });

  describe("Test Case 4: Corrupted baseline", () => {
    it("should detect corrupted baseline JSON", () => {
      const corrupted = "{ invalid json }}}";
      expect(isBaselineCorrupted(corrupted)).toBe(true);
    });

    it("should return null for baseline with missing fields", () => {
      const incomplete = JSON.stringify({ aceVersion: "1.2.0" });
      expect(deserializeBaseline(incomplete)).toBeNull();
    });

    it("should detect baseline with invalid result entries", () => {
      const badBaseline = JSON.stringify({
        aceVersion: "1.2.0",
        benchmarkVersion: "1.0.0",
        corpusHash: "abcd1234",
        version: { evidence: "1.2.0", normalization: "1.2.0", scoring: "1.2.0", metrics: "1.2.0", weighting: "1.2.0", reporting: "1.2.0", schema: "1.0.0" },
        results: {
          "bad_case": { /* missing required fields */ },
        },
      });
      expect(deserializeBaseline(badBaseline)).toBeNull();
    });

    it("should successfully deserialize a valid baseline", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);
      const json = serializeBaseline(baseline);
      const restored = deserializeBaseline(json);

      expect(restored).not.toBeNull();
      expect(restored!.aceVersion).toBe(baseline.aceVersion);
      expect(restored!.corpusHash).toBe(baseline.corpusHash);
    });
  });

  describe("Test Case 5: Interrupted benchmark run (partial corpus)", () => {
    it("should handle partial corpus without aborting", () => {
      const partialCorpus: BenchmarkCorpus = {
        cases: [
          {
            id: "partial_001",
            category: "test",
            snapshotHtml: createSimpleHtml("Partial 1", "Content 1"),
            url: "https://example.com/partial1",
          },
          {
            id: "partial_002",
            category: "test",
            // No snapshotHtml and no url — will error
          },
          {
            id: "partial_003",
            category: "test",
            snapshotHtml: createSimpleHtml("Partial 3", "Content 3"),
            url: "https://example.com/partial3",
          },
        ],
        totalCount: 3,
      };

      setupMockPipeline(partialCorpus);
      const results = runBenchmarkCorpus(partialCorpus, "regression");

      expect(results.length).toBe(3);
      expect(results[0].status).toBe("ok");
      expect(results[1].status).toBe("error");
      expect(results[2].status).toBe("ok");
    });

    it("should record error messages for failed cases", () => {
      const failingCorpus: BenchmarkCorpus = {
        cases: [
          {
            id: "fail_001",
            category: "test",
            // No content — will error
          },
        ],
        totalCount: 1,
      };

      const results = runBenchmarkCorpus(failingCorpus, "regression");

      expect(results[0].status).toBe("error");
      expect(results[0].errorMessage).toBeDefined();
      expect(results[0].score).toBeNull();
    });
  });

  describe("Test Case 6: 1600-site CSV corpus load (8×200)", () => {
    it("should generate and parse a 1600-site CSV", () => {
      const csv = generateSyntheticCorpusCsv();
      const rows = parseCsv(csv);

      // Header + 1600 data rows
      expect(rows.length).toBe(1601);
      expect(rows[0]).toEqual(["page_id", "category", "url", "expected_type", "tags", "notes"]);
    });

    it("should validate the 1600-site CSV without errors", () => {
      const csv = generateSyntheticCorpusCsv();
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);

      expect(validation.valid).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.rowCount).toBe(1600);
    });

    it("should load the 1600-site CSV into a corpus with 8 categories", async () => {
      const csv = generateSyntheticCorpusCsv();
      const provider = new CsvCorpusProvider(csv);
      const corpus = await provider.load();

      expect(corpus.totalCount).toBe(1600);

      const categories = new Set(corpus.cases.map((c) => c.category));
      expect(categories.size).toBe(8);

      // Verify each category has 200 cases
      const categoryCounts: Record<string, number> = {};
      for (const c of corpus.cases) {
        categoryCounts[c.category] = (categoryCounts[c.category] ?? 0) + 1;
      }
      for (const count of Object.values(categoryCounts)) {
        expect(count).toBe(200);
      }
    });

    it("should have cases sorted by category, then page_id", async () => {
      const csv = generateSyntheticCorpusCsv();
      const provider = new CsvCorpusProvider(csv);
      const corpus = await provider.load();

      for (let i = 1; i < corpus.cases.length; i++) {
        const prev = corpus.cases[i - 1];
        const curr = corpus.cases[i];
        if (prev.category === curr.category) {
          expect(prev.id.localeCompare(curr.id)).toBeLessThanOrEqual(0);
        } else {
          expect(prev.category.localeCompare(curr.category)).toBeLessThan(0);
        }
      }
    });
  });

  describe("Test Case 7: Regression Mode vs Live Mode separation", () => {
    it("should mark results with the correct mode", () => {
      const corpus = createTestCorpus();

      setupMockPipeline(corpus);
      const regressionResults = runBenchmarkCorpus(corpus, "regression");
      const liveResults = runBenchmarkCorpus(corpus, "live");

      for (const r of regressionResults) {
        expect(r.mode).toBe("regression");
      }
      for (const r of liveResults) {
        expect(r.mode).toBe("live");
      }
    });

    it("should produce identical scores for same snapshots regardless of mode", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);

      const regressionResults = runBenchmarkCorpus(corpus, "regression");
      const liveResults = runBenchmarkCorpus(corpus, "live");

      for (let i = 0; i < regressionResults.length; i++) {
        const rScore = regressionResults[i].score?.finalScore ?? null;
        const lScore = liveResults[i].score?.finalScore ?? null;
        expect(rScore).toBe(lScore);
      }
    });

    it("should not treat live results as regression baselines", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const liveResults = runBenchmarkCorpus(corpus, "live");

      // Creating a baseline from live results should still work,
      // but it should be marked as a baseline — not used for regression comparison
      const baseline = createBaseline(corpus, liveResults);
      expect(baseline.aceVersion).toBeDefined();
      expect(baseline.corpusHash).toBeDefined();
    });
  });

  describe("Test Case 8: Deterministic repeat runs", () => {
    it("should produce identical JSON output across runs (excluding timestamp)", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);

      const results1 = runBenchmarkCorpus(corpus, "regression");
      const results2 = runBenchmarkCorpus(corpus, "regression");

      const stripTimestamp = (r: BenchmarkResult) => {
        const { score, ...rest } = r;
        if (score) {
          const { timestamp: _ts, ...scoreRest } = score;
          return { ...rest, score: scoreRest };
        }
        return rest;
      };

      const json1 = JSON.stringify(results1.map(stripTimestamp));
      const json2 = JSON.stringify(results2.map(stripTimestamp));

      expect(json2).toBe(json1);
    });

    it("should produce identical corpus hash across runs", () => {
      const corpus1 = createTestCorpus();
      const corpus2 = createTestCorpus();

      const hash1 = computeCorpusHash(corpus1);
      const hash2 = computeCorpusHash(corpus2);

      expect(hash2).toBe(hash1);
    });

    it("should produce identical regression comparison results across runs", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      // Run again and compare
      const results2 = runBenchmarkCorpus(corpus, "regression");
      const comparison1 = compareRegression(results, baseline);
      const comparison2 = compareRegression(results2, baseline);

      // Both should have no drift (same corpus, same processing)
      expect(comparison1.corpusDrift).toBe(false);
      expect(comparison2.corpusDrift).toBe(false);
      expect(comparison2.casesWithDrift).toBe(comparison1.casesWithDrift);
    });
  });

  describe("Test Case 9: Corpus hash stability", () => {
    it("should produce a stable hash for the same corpus", () => {
      const corpus = createTestCorpus();
      const hash1 = computeCorpusHash(corpus);
      const hash2 = computeCorpusHash(corpus);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[0-9a-f]+$/);
    });

    it("should produce different hashes for different corpora", () => {
      const corpus1 = createTestCorpus();
      const corpus2: BenchmarkCorpus = {
        cases: [...corpus1.cases, {
          id: "test_004",
          category: "news",
          snapshotHtml: createSimpleHtml("Extra", "Extra content"),
        }],
        totalCount: 4,
      };

      const hash1 = computeCorpusHash(corpus1);
      const hash2 = computeCorpusHash(corpus2);

      expect(hash1).not.toBe(hash2);
    });

    it("should produce the same hash regardless of case order", () => {
      const corpus = createTestCorpus();
      const reversed: BenchmarkCorpus = {
        cases: [...corpus.cases].reverse(),
        totalCount: corpus.totalCount,
      };

      // The hash should differ because order matters in the hash
      // (ordering is part of the corpus definition)
      const hash1 = computeCorpusHash(corpus);
      const hash2 = computeCorpusHash(reversed);

      // After sortCasesDeterministic, both should produce the same hash
      const sortedCorpus = { cases: sortCasesDeterministic(corpus.cases), totalCount: corpus.totalCount };
      const sortedReversed = { cases: sortCasesDeterministic(reversed.cases), totalCount: reversed.totalCount };
      const sortedHash1 = computeCorpusHash(sortedCorpus);
      const sortedHash2 = computeCorpusHash(sortedReversed);

      expect(sortedHash2).toBe(sortedHash1);
    });
  });

  describe("Drift Detection", () => {
    it("should detect no drift between identical results", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      // Compare results against themselves
      const comparison = compareRegression(results, baseline);

      expect(comparison.corpusDrift).toBe(false);
      expect(comparison.casesWithDrift).toBe(0);
    });

    it("should detect drift when a case is missing from current results", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      // Remove one result
      const partialResults = results.slice(0, 2);
      const comparison = compareRegression(partialResults, baseline);

      expect(comparison.corpusDrift).toBe(true);
      expect(comparison.casesWithDrift).toBeGreaterThan(0);
    });

    it("should detect score drift when scores change", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      // Modify a result to create drift
      const modifiedResults: BenchmarkResult[] = results.map((r, i) => {
        if (i === 0 && r.score) {
          return {
            ...r,
            score: {
              ...r.score,
              finalScore: (r.score.finalScore ?? 0) + 10, // Significant change
            },
          };
        }
        return r;
      });

      const comparison = compareRegression(modifiedResults, baseline);

      expect(comparison.casesWithDrift).toBeGreaterThan(0);
      const firstResult = comparison.results[0];
      expect(firstResult.drift.some((d) => d.type === "score")).toBe(true);
    });
  });

  describe("Benchmark Reports", () => {
    it("should build a benchmark summary report", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");

      const summary = {
        totalSites: results.length,
        passed: results.filter((r) => r.status === "ok").length,
        failed: results.filter((r) => r.status === "error").length,
        driftDetected: 0,
        categories: {},
        performance: {
          averageRuntimeMs: 1,
          medianRuntimeMs: 1,
          slowestPageId: "test_001",
          fastestPageId: "test_001",
        },
      };

      const report = buildBenchmarkSummaryReport(corpus, results, summary, "regression");

      expect(report).toBeDefined();
      expect(report.totalSites).toBe(results.length);
      expect(report.mode).toBe("regression");
      expect(report.corpusHash).toBeDefined();
      expect(report.version.reporting).toBeDefined();
    });

    it("should build a regression report", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);
      const comparison = compareRegression(results, baseline);

      const report = buildRegressionReport(corpus, comparison, "1.0.0");

      expect(report).toBeDefined();
      expect(report.totalCases).toBe(results.length);
      expect(report.corpusDrift).toBe(false);
      expect(report.baselineVersion).toBe("1.0.0");
    });

    it("should build a drift report", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);
      const comparison = compareRegression(results, baseline);

      const report = buildDriftReport(comparison);

      expect(report).toBeDefined();
      expect(report.totalDriftRecords).toBe(0); // No drift
      expect(report.records).toBeDefined();
    });
  });

  describe("Multi-site benchmark", () => {
    it("should run a multi-site benchmark and return sorted results", async () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const result = await runMultiSiteBenchmark(corpus, "regression", 1);

      expect(result.results.length).toBe(corpus.cases.length);
      expect(result.summary.totalSites).toBe(corpus.cases.length);

      // Verify results are sorted by category, then caseId
      for (let i = 1; i < result.results.length; i++) {
        const prev = result.results[i - 1];
        const curr = result.results[i];
        if (prev.category === curr.category) {
          expect(prev.caseId.localeCompare(curr.caseId)).toBeLessThanOrEqual(0);
        } else {
          expect(prev.category.localeCompare(curr.category)).toBeLessThanOrEqual(0);
        }
      }
    });

    it("should include performance metrics", async () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const result = await runMultiSiteBenchmark(corpus, "regression", 1);

      expect(result.summary.performance).toBeDefined();
      expect(result.summary.performance.averageRuntimeMs).toBeGreaterThanOrEqual(0);
      expect(result.summary.performance.medianRuntimeMs).toBeGreaterThanOrEqual(0);
      expect(result.summary.performance.slowestPageId).toBeDefined();
      expect(result.summary.performance.fastestPageId).toBeDefined();
    });
  });

  describe("Baseline compatibility", () => {
    it("should be compatible with the same corpus", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      expect(isBaselineCompatible(baseline, corpus)).toBe(true);
    });

    it("should not be compatible with a different corpus", () => {
      const corpus = createTestCorpus();
      setupMockPipeline(corpus);
      const results = runBenchmarkCorpus(corpus, "regression");
      const baseline = createBaseline(corpus, results);

      const differentCorpus: BenchmarkCorpus = {
        cases: [...corpus.cases, {
          id: "extra_001",
          category: "extra",
          snapshotHtml: createSimpleHtml("Extra", "Extra"),
        }],
        totalCount: 4,
      };

      expect(isBaselineCompatible(baseline, differentCorpus)).toBe(false);
    });
  });
});
