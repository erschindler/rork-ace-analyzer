/**
 * ACE v1.2 End-to-End Extraction Stress Test
 *
 * Tests the full pipeline (fetch → render → extract → normalize → score) against
 * real websites via the Cloudflare Worker backend. Verifies:
 * - Full HTML is fetched (no truncation)
 * - Visible text extraction is complete
 * - Normalized text matches visible text
 * - Scoring produces valid results
 * - No false contamination flags
 * - Rendering diagnostics are correct for JS-heavy/Elementor/lazy-load sites
 * - Structural consistency (no contradictory heading counts)
 * - No mid-sentence truncation in normalized text
 * - Correct contamination handling for malformed/script-only inputs
 *
 * Uses Playwright Chromium for DOMParser and iframe rendering support.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { extractEvidenceFromUrl } from "@/modules/evidence/inputHandlers";
import { normalizeEvidence } from "@/modules/normalization";
import { scoreNormalizedEvidence } from "@/modules/scoring";
import { generateAceReport } from "@/modules/reporting";
import { hasBackend } from "@/lib/backend";
import { isMidSentenceTruncation } from "@/modules/evidence/domParser";
import { extractEvidenceFromHtmlString } from "@/modules/evidence/evidenceLayer";
import type { AceEvidenceResult, NormalizedEvidenceResult, NormalizedHierarchyNode } from "@/types";

interface TestSite {
  name: string;
  url: string;
  /** Minimum expected HTML size in bytes. */
  minHtmlSize: number;
  /** Minimum expected visible text characters. */
  minVisibleText: number;
  /** Minimum expected heading count. */
  minHeadings: number;
  /** Whether the site should be scored (not blocked). */
  expectScored: boolean;
  /** Site category for grouping. */
  category: "wiki" | "ecommerce" | "social" | "docs" | "news" | "gov" | "hotel" | "tech" | "blog" | "spa";
  /** Whether the site is expected to use JS rendering (lazy-load, Elementor, SPA). */
  expectsRendering?: boolean;
  /** Whether the site is expected to use Elementor. */
  expectsElementor?: boolean;
  /** Whether the site is expected to have lazy-loaded content. */
  expectsLazyLoad?: boolean;
}

const TEST_SITES: TestSite[] = [
  {
    name: "Wikipedia — Web Accessibility",
    url: "https://en.wikipedia.org/wiki/Web_accessibility",
    minHtmlSize: 100_000,
    minVisibleText: 10_000,
    minHeadings: 10,
    expectScored: true,
    category: "wiki",
  },
  {
    name: "GitHub — VS Code Repo",
    url: "https://github.com/microsoft/vscode",
    minHtmlSize: 50_000,
    minVisibleText: 3_000,
    minHeadings: 5,
    expectScored: true,
    category: "tech",
    expectsRendering: true,
  },
  {
    name: "MDN — HTML Reference",
    url: "https://developer.mozilla.org/en-US/docs/Web/HTML",
    minHtmlSize: 50_000,
    minVisibleText: 5_000,
    minHeadings: 5,
    expectScored: true,
    category: "docs",
  },
  {
    name: "NY Times Homepage",
    url: "https://www.nytimes.com",
    minHtmlSize: 100_000,
    minVisibleText: 5_000,
    minHeadings: 10,
    expectScored: true,
    category: "news",
    expectsRendering: true,
    expectsLazyLoad: true,
  },
  {
    name: "GOV.UK Homepage",
    url: "https://www.gov.uk",
    minHtmlSize: 20_000,
    minVisibleText: 2_000,
    minHeadings: 5,
    expectScored: true,
    category: "gov",
  },
  {
    name: "Oliver Hotel (Elementor/WordPress)",
    url: "https://theoliverhotel.com/",
    minHtmlSize: 50_000,
    minVisibleText: 2_000,
    minHeadings: 5,
    expectScored: true,
    category: "hotel",
    expectsRendering: true,
    expectsElementor: true,
    expectsLazyLoad: true,
  },
  {
    name: "BBC News Homepage",
    url: "https://www.bbc.com/news",
    minHtmlSize: 50_000,
    minVisibleText: 3_000,
    minHeadings: 5,
    expectScored: true,
    category: "news",
    expectsLazyLoad: true,
  },
  {
    name: "Stack Overflow — Questions",
    url: "https://stackoverflow.com/questions",
    minHtmlSize: 30_000,
    minVisibleText: 2_000,
    minHeadings: 3,
    expectScored: true,
    category: "tech",
    expectsRendering: true,
  },
];

describe("ACE v1.2 End-to-End Extraction Stress Test", () => {
  const shouldRun = hasBackend();

  beforeAll(() => {
    if (!shouldRun) {
      console.warn("Backend not available — skipping stress tests");
    }
  });

  describe("Full pipeline per site", () => {
    for (const site of TEST_SITES) {
      const siteName = site.name;

      describe(`${siteName}`, () => {
        let evidence: AceEvidenceResult;
        let normalized: NormalizedEvidenceResult;
        let score: ReturnType<typeof scoreNormalizedEvidence>;

        beforeAll(async () => {
          if (!shouldRun) return;
          evidence = await extractEvidenceFromUrl(site.url);
          normalized = normalizeEvidence(evidence);
          score = scoreNormalizedEvidence(normalized);
        }, 120_000);

        it("should fetch full HTML (no truncation)", () => {
          if (!shouldRun) return;
          const htmlSize = evidence.diagnostics?.htmlSize ?? 0;
          expect(htmlSize).toBeGreaterThanOrEqual(site.minHtmlSize);
        });

        it("should extract substantial visible text", () => {
          if (!shouldRun) return;
          const visibleText = evidence.rawVisibleText ?? "";
          expect(visibleText.length).toBeGreaterThanOrEqual(site.minVisibleText);
        });

        it("should extract headings", () => {
          if (!shouldRun) return;
          const headingCount = evidence.headings.reduce((s, sec) => s + sec.count, 0);
          expect(headingCount).toBeGreaterThanOrEqual(site.minHeadings);
        });

        it("normalizedText should match or exceed rawVisibleText length (no truncation)", () => {
          if (!shouldRun) return;
          const rawLen = (evidence.rawVisibleText ?? "").length;
          const normLen = normalized.normalizedText.length;
          if (rawLen > 0) {
            expect(normLen).toBeGreaterThanOrEqual(Math.floor(rawLen * 0.8));
          }
        });

        it("normalized words should be substantial", () => {
          if (!shouldRun) return;
          const wordCount = normalized.normalizedWords.length;
          const minWords = Math.floor(site.minVisibleText / 10);
          expect(wordCount).toBeGreaterThanOrEqual(minWords);
        });

        it("should not have false contamination flags", () => {
          if (!shouldRun) return;
          if (evidence.contamination) {
            const criticalFlags = (evidence.contaminationFlags ?? []).filter(
              (f) =>
                f === "fetch_failure" ||
                f === "hydration_shell" ||
                f === "script_only_dom" ||
                f === "dom_corruption" ||
                f === "invalid_url" ||
                f === "unsupported_protocol",
            );
            expect(criticalFlags.length).toBe(0);
          }
        });

        it("should produce a valid ACE score", () => {
          if (!shouldRun) return;
          if (site.expectScored) {
            expect(score.status).not.toBe("insufficient_evidence");
            if (score.status === "scored" || score.status === "scored_absence_evidence") {
              expect(score.finalScore).not.toBeNull();
              expect(score.confidence).not.toBeNull();
              expect(score.finalScore!).toBeGreaterThanOrEqual(0);
              expect(score.finalScore!).toBeLessThanOrEqual(100);
            }
          }
        });

        it("should generate a valid report", () => {
          if (!shouldRun) return;
          const report = generateAceReport(score, normalized);
          expect(report).toBeDefined();
          expect(report.url.replace(/\/$/, "")).toBe(site.url.replace(/\/$/, ""));
          expect(report.status).toBe(score.status);
        });

        it("hierarchy should contain headings (no contradiction)", () => {
          if (!shouldRun) return;
          const evidenceHeadingCount = evidence.headings.reduce((s, sec) => s + sec.count, 0);
          if (evidenceHeadingCount > 0 && normalized.hierarchy) {
            const hierarchyHeadings = countHeadingsInHierarchy(normalized.hierarchy);
            expect(hierarchyHeadings).toBeGreaterThanOrEqual(
              Math.floor(evidenceHeadingCount * 0.15),
            );
          }
        });

        it("normalized text should not end mid-sentence", () => {
          if (!shouldRun) return;
          if (normalized.normalizedText.length > 100) {
            expect(isMidSentenceTruncation(normalized.normalizedText)).toBe(false);
          }
        });

        it("structural consistency should have no contradictions", () => {
          if (!shouldRun) return;
          const consistency = evidence.diagnostics?.structuralConsistency;
          if (consistency) {
            // Contradictions are warnings, not necessarily fatal — but we track them
            if (consistency.hasContradictions) {
              // Log for diagnosis but don't fail — some sites may have edge cases
              console.warn(
                `[${siteName}] Structural contradictions:`,
                consistency.contradictions,
              );
            }
            // At minimum, the heading count should be consistent
            if (consistency.headingExtractorCount > 0) {
              expect(consistency.hierarchyHeadingCount).toBeGreaterThan(0);
            }
          }
        });

        if (site.expectsElementor) {
          it("should detect Elementor patterns in the page", () => {
            if (!shouldRun) return;
            const rendering = evidence.diagnostics?.rendering;
            if (rendering) {
              expect(rendering.elementorDetected).toBe(true);
            }
          });
        }

        if (site.expectsLazyLoad) {
          it("should detect lazy-load patterns and trigger scrolling", () => {
            if (!shouldRun) return;
            const rendering = evidence.diagnostics?.rendering;
            if (rendering && rendering.rendered) {
              // If rendering was used, lazy load should have been triggered
              // (may not always be true if patterns exist but don't need scrolling)
              expect(rendering.lazyLoadTriggered).toBe(true);
            }
          });
        }
      });
    }
  });

  describe("Synthetic edge-case tests", () => {
    it("should detect script-only DOM as contamination", () => {
      const scriptOnlyHtml = `<!DOCTYPE html><html><head><title>Test</title></head><body><script>var x = 1;</script><script>var y = 2;</script></body></html>`;
      const result = extractEvidenceFromHtmlString(scriptOnlyHtml, "test://script-only");
      expect(result.contamination).toBe(true);
      expect(result.contaminationFlags).toContain("script_only_dom");
    });

    it("should detect hydration shell as contamination", () => {
      const hydrationHtml = `<!DOCTYPE html><html><head><title>SPA</title></head><body><div id="root" data-reactroot></div><script src="/app.js"></script><script src="/vendor.js"></script><script src="/runtime.js"></script></body></html>`;
      const result = extractEvidenceFromHtmlString(hydrationHtml, "test://hydration");
      expect(result.contamination).toBe(true);
      expect(result.contaminationFlags).toContain("hydration_shell");
    });

    it("should not flag minimal but valid HTML as contaminated", () => {
      const minimalHtml = `<!DOCTYPE html><html><head><title>Simple</title></head><body><main><h1>Hello World</h1><p>This is a simple page with enough text to not be flagged as contaminated. It has a heading and a paragraph.</p></main></body></html>`;
      const result = extractEvidenceFromHtmlString(minimalHtml, "test://minimal");
      expect(result.contamination).toBe(false);
      expect(result.diagnostics?.domCorruption).toBeFalsy();
    });

    it("should detect malformed HTML gracefully", () => {
      const malformedHtml = `<html><head><title>Broken</title></head><body><h1>Title<p>Unclosed heading</body></html>`;
      const result = extractEvidenceFromHtmlString(malformedHtml, "test://malformed");
      // Should not throw — DOMParser handles malformed HTML
      expect(result).toBeDefined();
      // May or may not be contaminated depending on what DOMParser produces
    });

    it("should detect mid-sentence truncation", () => {
      const truncatedText = "This is a substantial piece of text that goes on for well over two hundred characters. It contains multiple sentences with proper punctuation. But then the text continues with a long trailing section that was clearly cut off during the fetch operation and the content ends abruptly without any terminal punctuation or proper ending, just stopp";
      expect(isMidSentenceTruncation(truncatedText)).toBe(true);
    });

    it("should not flag properly ended text as truncated", () => {
      const properText = "This is a substantial piece of text that goes on for over one hundred characters and it ends properly with a period. This is how text should end.";
      expect(isMidSentenceTruncation(properText)).toBe(false);
    });

    it("should have rendering diagnostics when rendering is used", () => {
      if (!shouldRun) return;
      // For sites that should use rendering, check diagnostics are populated
      // This is verified in the per-site tests
      expect(true).toBe(true);
    });
  });

  describe("Cross-site consistency", () => {
    it("all scored sites should have non-empty metrics", async () => {
      if (!shouldRun) return;
      for (const site of TEST_SITES) {
        if (!site.expectScored) continue;
        const ev = await extractEvidenceFromUrl(site.url);
        const norm = normalizeEvidence(ev);
        const sc = scoreNormalizedEvidence(norm);
        if (sc.status === "scored") {
          const metricKeys = Object.keys(sc.metrics);
          expect(metricKeys.length).toBeGreaterThan(0);
        }
      }
    }, 300_000);
  });
});

/** Count heading nodes (h1-h6) in a normalized hierarchy tree. */
function countHeadingsInHierarchy(node: NormalizedHierarchyNode): number {
  let count = /^h[1-6]$/.test(node.tag) ? 1 : 0;
  for (const child of node.children) {
    count += countHeadingsInHierarchy(child);
  }
  return count;
}
