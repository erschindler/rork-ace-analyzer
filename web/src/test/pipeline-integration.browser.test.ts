/**
 * Pipeline Integration Tests — Real-World Sites
 *
 * Runs the full ACE pipeline (evidence extraction → normalization → scoring → reporting)
 * against real HTML fetched from live websites. Uses the browser test environment
 * (Playwright/Chromium) which has a native DOMParser.
 *
 * Test sites:
 * - Wikipedia (www.wikipedia.org) — well-structured, semantic, multilingual
 * - The Oliver Hotel (theoliverhotel.com) — WordPress site, typical small business
 * - Reddit (www.reddit.com) — SPA-heavy, server-rendered shell
 * - GitHub (github.com) — modern React app, semantic HTML
 * - MDN (developer.mozilla.org) — documentation, excellent structure
 * - NY Times (www.nytimes.com) — news, metered content, complex layout
 * - GOV.UK (www.gov.uk) — government, accessibility-first
 * - Empty HTML — edge case (insufficient evidence)
 */

import { describe, it, expect } from "vitest";
import { extractEvidenceFromHtmlString, getEvidenceSummary } from "@/modules/evidence";
import { normalizeEvidence, getNormalizedSummary } from "@/modules/normalization";
import { scoreNormalizedEvidence, getGrade } from "@/modules/scoring";
import { generateAceReport, generateSummaryReport, generateDeveloperReport, generateReports } from "@/modules/reporting";
import type { ACEScore, AceReport, AceSummaryReport, DeveloperReport, NormalizedEvidenceResult, AceEvidenceResult } from "@/types";

// Import real HTML fixtures as raw strings
import wikipediaHtml from "./fixtures/wikipedia.html?raw";
import oliverHotelHtml from "./fixtures/oliver-hotel.html?raw";
import redditHtml from "./fixtures/reddit.html?raw";
import githubHtml from "./fixtures/github.html?raw";
import mdnHtml from "./fixtures/mdn.html?raw";
import nytimesHtml from "./fixtures/nytimes.html?raw";
import govukHtml from "./fixtures/govuk.html?raw";

interface SiteFixture {
  name: string;
  url: string;
  html: string;
  minHtmlSize: number;
  description: string;
}

const SITES: SiteFixture[] = [
  {
    name: "Wikipedia",
    url: "https://www.wikipedia.org/",
    html: wikipediaHtml,
    minHtmlSize: 50000,
    description: "well-structured semantic multilingual portal",
  },
  {
    name: "The Oliver Hotel",
    url: "https://theoliverhotel.com/",
    html: oliverHotelHtml,
    minHtmlSize: 50000,
    description: "WordPress small-business site",
  },
  {
    name: "Reddit",
    url: "https://www.reddit.com/",
    html: redditHtml,
    minHtmlSize: 1000,
    description: "SPA-heavy server-rendered shell",
  },
  {
    name: "GitHub",
    url: "https://github.com/",
    html: githubHtml,
    minHtmlSize: 100000,
    description: "modern React app with semantic HTML",
  },
  {
    name: "MDN Web Docs",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
    html: mdnHtml,
    minHtmlSize: 50000,
    description: "documentation with excellent structure",
  },
  {
    name: "New York Times",
    url: "https://www.nytimes.com/",
    html: nytimesHtml,
    minHtmlSize: 500000,
    description: "news site with complex layout",
  },
  {
    name: "GOV.UK",
    url: "https://www.gov.uk/",
    html: govukHtml,
    minHtmlSize: 20000,
    description: "accessibility-first government site",
  },
];

interface PipelineResult {
  evidence: AceEvidenceResult;
  normalized: NormalizedEvidenceResult;
  score: ACEScore;
  report: AceReport;
  summary: AceSummaryReport;
  developer: DeveloperReport;
  unified: { full: AceReport; developer: DeveloperReport; summary: AceSummaryReport };
}

describe("Pipeline Integration — Real-World Sites", () => {
  // Helper: run full pipeline and return all outputs
  function runFullPipeline(html: string, url: string): PipelineResult {
    const evidence = extractEvidenceFromHtmlString(html, url);
    const normalized = normalizeEvidence(evidence);
    const score = scoreNormalizedEvidence(normalized);
    const report = generateAceReport(score, normalized);
    const summary = generateSummaryReport(score);
    const developer = generateDeveloperReport(score, normalized, evidence);
    const unified = generateReports(score, normalized, evidence);
    return { evidence, normalized, score, report, summary, developer, unified };
  }

  // Run each site as a sub-test suite
  for (const site of SITES) {
    describe(`${site.name} (${site.description})`, () => {
      let pipeline: PipelineResult;

      it("should run full pipeline without throwing", () => {
        pipeline = runFullPipeline(site.html, site.url);
        expect(pipeline.evidence).toBeDefined();
        expect(pipeline.normalized).toBeDefined();
        expect(pipeline.score).toBeDefined();
        expect(pipeline.report).toBeDefined();
        expect(pipeline.summary).toBeDefined();
        expect(pipeline.developer).toBeDefined();
      });

      it("should have fetched non-trivial HTML", () => {
        expect(site.html.length).toBeGreaterThan(site.minHtmlSize);
        expect(site.html).toContain("<");
      });

      it("should extract evidence with valid diagnostics", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const evidence = pipeline.evidence;
        expect(evidence.url).toBe(site.url);
        expect(evidence.timestamp).toBeGreaterThan(0);

        const diag = evidence.diagnostics;
        expect(diag).toBeDefined();
        expect(diag.htmlSize).toBe(site.html.length);
        expect(diag.visibleTextLength).toBeGreaterThanOrEqual(0);
        expect(typeof diag.mainContentFound).toBe("boolean");
      });

      it("should normalize evidence without throwing", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const summary = getNormalizedSummary(pipeline.normalized);
        expect(summary).toBeDefined();
        expect(Object.keys(summary).length).toBeGreaterThan(0);
        expect(typeof summary.headings).toBe("number");
        expect(typeof summary.warnings).toBe("number");
      });

      it("should produce a valid ACEScore", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const score: ACEScore = pipeline.score;
        expect(score.version).toBeDefined();
        expect(score.timestamp).toBeGreaterThan(0);
        expect(score.weightingProfile).toBeDefined();
        expect(score.metrics).toBeDefined();

        // ACE v1.2: Critical contamination blocks scoring → empty metrics, null score
        // Non-critical contamination still scores with reduced confidence
        // If all metrics are null (insufficient evidence without critical contamination),
        // metrics will have 12 entries all with score=null.
        if (score.status === "insufficient_evidence" && score.diagnostics.contamination) {
          expect(score.finalScore).toBeNull();
          expect(score.confidence).toBeNull();
          // Critical contamination → empty metrics; non-critical → 12 null metrics
          const metricCount = Object.keys(score.metrics).length;
          expect(metricCount === 0 || metricCount === 12).toBe(true);
        } else {
          expect(Object.keys(score.metrics).length).toBe(12);
          expect(score.finalScore === null || typeof score.finalScore === "number").toBe(true);
          expect(score.confidence === null || typeof score.confidence === "number").toBe(true);
          if (score.finalScore !== null) {
            const grade = getGrade(score.finalScore);
            expect(["A", "B", "C", "D", "F"]).toContain(grade);
            expect(score.finalScore).toBeGreaterThanOrEqual(0);
            expect(score.finalScore).toBeLessThanOrEqual(100);
          }
        }
      });

      it("should produce a valid AceReport with version metadata", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const report: AceReport = pipeline.report;
        expect(report).toBeDefined();
        expect(report.version).toBeDefined();
        expect(report.version.reporting).toBe("1.2.0");
        expect(report.version.schema).toBe("1.0.0");
        expect(report.metrics).toBeDefined();
        // ACE v1.2: Contaminated sites may have empty metrics (critical) or 12 null
        // metrics (non-critical insufficient). Non-contaminated scored sites have 12.
        if (report.status === "insufficient_evidence") {
          const metricCount = Object.keys(report.metrics).length;
          expect(metricCount === 0 || metricCount === 12).toBe(true);
        } else {
          expect(Object.keys(report.metrics).length).toBe(12);
        }
      });

      it("should produce a valid summary report", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const summary: AceSummaryReport = pipeline.summary;
        expect(summary).toBeDefined();
        expect(summary.version).toBeDefined();
        expect(summary.finalScore === null || typeof summary.finalScore === "number").toBe(true);
        expect(summary.status).toBeDefined();
      });

      it("should produce a valid developer report", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const dev: DeveloperReport = pipeline.developer;
        expect(dev).toBeDefined();
        expect(dev.version).toBeDefined();
        expect(dev.diagnostics).toBeDefined();
      });

      it("unified API should match individual calls", () => {
        pipeline = runFullPipeline(site.html, site.url);
        expect(pipeline.unified.full).toEqual(pipeline.report);
        expect(pipeline.unified.summary).toEqual(pipeline.summary);
        expect(pipeline.unified.developer).toEqual(pipeline.developer);
      });

      it("should have evidence summary with counts", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const summary = getEvidenceSummary(pipeline.evidence);
        expect(summary).toBeDefined();
        expect(typeof summary.headings).toBe("number");
        expect(typeof summary.paragraphs).toBe("number");
        expect(typeof summary.links).toBe("number");
      });

      it("should have metric keys in canonical order (when scored)", () => {
        pipeline = runFullPipeline(site.html, site.url);
        const keys = Object.keys(pipeline.score.metrics);
        // ACE v1.2: Critical contamination → empty metrics; non-critical insufficient → 12 null metrics
        if (pipeline.score.status === "insufficient_evidence" && pipeline.score.diagnostics.contamination) {
          expect(keys.length === 0 || keys.length === 12).toBe(true);
        } else {
          expect(keys).toEqual([
            "readability",
            "structure",
            "clarity",
            "consistency",
            "semantic",
            "completeness",
            "semanticStructure",
            "structuredData",
            "extractability",
            "accessibility",
            "entityRecognition",
            "machineComprehension",
          ]);
        }
      });

      it("should not have fetch_failure contamination for real sites", () => {
        pipeline = runFullPipeline(site.html, site.url);
        // Real HTML was successfully fetched — no fetch_failure flag
        expect(pipeline.evidence.contaminationFlags).not.toContain("fetch_failure");
      });

      it("should produce deterministic results on repeat", () => {
        const first = runFullPipeline(site.html, site.url);
        const second = runFullPipeline(site.html, site.url);
        // Strip timestamps which naturally differ between runs
        const stripTs = (obj: unknown) => {
          const json = JSON.stringify(obj);
          return json.replace(/"timestamp":\d+/g, '"timestamp":0');
        };
        expect(stripTs(second.score)).toBe(stripTs(first.score));
        expect(stripTs(second.report)).toBe(stripTs(first.report));
        expect(stripTs(second.summary)).toBe(stripTs(first.summary));
      });
    });
  }

  // Edge case: empty HTML
  describe("Empty HTML (edge case)", () => {
    let pipeline: PipelineResult;

    it("should not throw", () => {
      pipeline = runFullPipeline("", "https://example.com/empty");
      expect(pipeline.evidence).toBeDefined();
      expect(pipeline.normalized).toBeDefined();
      expect(pipeline.score).toBeDefined();
      expect(pipeline.report).toBeDefined();
    });

    it("should produce insufficient evidence for empty HTML (ACE v1.2)", () => {
      // ACE v1.2: Empty HTML triggers DOM corruption (fewer than 5 text nodes),
      // which is critical contamination. Scoring is blocked.
      pipeline = runFullPipeline("", "https://example.com/empty");
      expect(pipeline.score.status).toBe("insufficient_evidence");
      expect(pipeline.score.finalScore).toBeNull();
      expect(pipeline.score.confidence).toBeNull();
      expect(pipeline.score.diagnostics.contamination).toBe(true);
    });

    it("should have grade N/A for empty HTML", () => {
      pipeline = runFullPipeline("", "https://example.com/empty");
      const grade = getGrade(pipeline.score.finalScore);
      expect(grade).toBe("N/A");
    });

    it("should have metrics scored or with insufficient evidence", () => {
      pipeline = runFullPipeline("", "https://example.com/empty");
      for (const [, metric] of Object.entries(pipeline.score.metrics)) {
        expect(["scored", "insufficient_evidence", "scored_absence_evidence"]).toContain(metric.status);
      }
    });

    it("should produce valid report with insufficient evidence", () => {
      pipeline = runFullPipeline("", "https://example.com/empty");
      expect(pipeline.report).toBeDefined();
      expect(pipeline.report.version.reporting).toBe("1.2.0");
      // ACE v1.2: Contamination blocks scoring → empty metrics in report
      expect(pipeline.report.status).toBe("insufficient_evidence");
      expect(Object.keys(pipeline.report.metrics).length).toBe(0);
      expect(pipeline.report.contamination).toBe(true);
    });
  });

  // Edge case: minimal HTML (valid but sparse content)
  describe("Minimal HTML (bare minimum)", () => {
    const minimalHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1><p>World</p></body></html>`;
    let pipeline: PipelineResult;

    it("should produce a numeric score (minimal but valid HTML)", () => {
      // ACE v1.2: Minimal HTML with 2 text nodes is valid — not DOM corruption.
      // It gets a low score due to absence of semantic elements, but it IS scored.
      pipeline = runFullPipeline(minimalHtml, "https://example.com/minimal");
      expect(pipeline.score.finalScore).not.toBe(null);
      expect(typeof pipeline.score.finalScore).toBe("number");
    });

    it("should have a valid grade (low score expected)", () => {
      pipeline = runFullPipeline(minimalHtml, "https://example.com/minimal");
      const grade = getGrade(pipeline.score.finalScore);
      expect(["A", "B", "C", "D", "F"]).toContain(grade);
    });

    it("should have 12 metrics scored with absence evidence", () => {
      pipeline = runFullPipeline(minimalHtml, "https://example.com/minimal");
      expect(Object.keys(pipeline.score.metrics).length).toBe(12);
      // Should have absence evidence for missing semantic elements
      expect(pipeline.score.status === "scored" || pipeline.score.status === "scored_absence_evidence").toBe(true);
    });
  });

  // Cross-site consistency checks
  describe("Cross-site consistency", () => {
    it("all sites should produce valid version metadata", () => {
      for (const site of SITES) {
        const { report } = runFullPipeline(site.html, site.url);
        expect(report.version.evidence).toBe("1.2.0");
        expect(report.version.normalization).toBe("1.2.0");
        expect(report.version.scoring).toBe("1.2.0");
        expect(report.version.metrics).toBe("1.2.0");
        expect(report.version.weighting).toBe("1.2.0");
        expect(report.version.reporting).toBe("1.2.0");
        expect(report.version.schema).toBe("1.0.0");
      }
    });

    it("all sites should have valid metric reports (12 when scored, 0 when contaminated)", () => {
      for (const site of SITES) {
        const { report } = runFullPipeline(site.html, site.url);
        if (report.status === "insufficient_evidence") {
          expect(Object.keys(report.metrics).length).toBe(0);
        } else {
          expect(Object.keys(report.metrics).length).toBe(12);
        }
      }
    });

    it("all scored sites should have confidence between 0 and 1", () => {
      for (const site of SITES) {
        const { score } = runFullPipeline(site.html, site.url);
        if (score.confidence !== null) {
          expect(score.confidence).toBeGreaterThanOrEqual(0);
          expect(score.confidence).toBeLessThanOrEqual(1);
        }
      }
    });
  });
});
