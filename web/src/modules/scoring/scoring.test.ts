/**
 * Scoring Engine Tests — Phase 4 (ACE v1.2)
 *
 * Test cases:
 * 1. Perfect semantic webpage — high finalScore, high confidence
 * 2. Empty HTML page — status = "insufficient_evidence"
 * 3. Script-only SPA shell — contamination detected, low extractability, low MC
 * 4. Missing JSON-LD — Structured Data weaknesses, reduced score
 * 5. No headings — Structure penalty, Semantic Structure penalty
 * 6. Deterministic repeat scoring — identical ACEScore output
 */

import { describe, it, expect } from "vitest";
import { scoreNormalizedEvidence, runAceScoringPipeline } from "@/modules/scoring/scoringPipeline";
import { DEFAULT_WEIGHTS } from "@/modules/scoring/weights";
import type {
  AceEvidenceResult,
  EvidenceSection,
  EvidenceSignal,
  NormalizedEvidenceResult,
  NormalizedSection,
  NormalizedSignal,
  HierarchyNode,
} from "@/types";

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a standard evidence signal. */
function sig(type: string, value: string, confidence: number = 0.9, metadata?: Record<string, unknown>): EvidenceSignal {
  return { type, value, confidence, selector: "body", metadata };
}

/** Create an evidence section. */
function section(category: string, label: string, signals: EvidenceSignal[], confidence: number = 0.9): EvidenceSection {
  return { category, label, signals, count: signals.length, confidence };
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

// ─── Mock Evidence: Perfect Semantic Webpage ────────────────────────

function createPerfectEvidence(): AceEvidenceResult {
  const headingSigs: EvidenceSignal[] = [
    sig("h1", "Understanding Machine Learning: A Comprehensive Guide", 0.95, { level: 1 }),
    sig("h2", "Introduction to Machine Learning", 0.93, { level: 2 }),
    sig("h2", "Types of Machine Learning", 0.92, { level: 2 }),
    sig("h3", "Supervised Learning", 0.91, { level: 3 }),
    sig("h3", "Unsupervised Learning", 0.91, { level: 3 }),
    sig("h3", "Reinforcement Learning", 0.90, { level: 3 }),
    sig("h2", "Applications of Machine Learning", 0.92, { level: 2 }),
    sig("h3", "Natural Language Processing", 0.90, { level: 3 }),
    sig("h3", "Computer Vision", 0.90, { level: 3 }),
    sig("h2", "Conclusion", 0.91, { level: 2 }),
  ];

  const paragraphSigs: EvidenceSignal[] = [
    sig("p", "Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience without being explicitly programmed.", 0.88),
    sig("p", "Supervised learning uses labeled training data to help models predict outcomes for unseen data. It is widely used in classification and regression tasks.", 0.87),
    sig("p", "Unsupervised learning discovers patterns in data without labels. Common techniques include clustering, dimensionality reduction, and association rules.", 0.87),
    sig("p", "Reinforcement learning trains agents through trial and error. The agent receives rewards or penalties for actions, learning optimal strategies over time.", 0.86),
    sig("p", "Machine learning has transformed industries from healthcare to finance. NLP applications include chatbots, translation, and sentiment analysis.", 0.87),
    sig("p", "Computer vision enables machines to interpret visual data. Applications range from facial recognition to autonomous driving and medical imaging.", 0.86),
    sig("p", "In conclusion, machine learning represents a fundamental shift in how computers solve problems. As data grows, its importance will only increase.", 0.85),
  ];

  const listSigs: EvidenceSignal[] = [
    sig("ul", "Supervised Learning | Unsupervised Learning | Reinforcement Learning", 0.85, { items: ["Supervised Learning", "Unsupervised Learning", "Reinforcement Learning"] }),
    sig("ol", "NLP | Computer Vision | Speech Recognition | Recommendation Systems", 0.84, { items: ["NLP", "Computer Vision", "Speech Recognition", "Recommendation Systems"] }),
  ];

  const semanticSigs: EvidenceSignal[] = [
    sig("main", "Main content area", 0.95, { tag: "main" }),
    sig("article", "Article content", 0.93, { tag: "article" }),
    sig("nav", "Navigation menu", 0.92, { tag: "nav" }),
    sig("header", "Page header", 0.92, { tag: "header" }),
    sig("footer", "Page footer", 0.91, { tag: "footer" }),
    sig("section", "Content section", 0.90, { tag: "section" }),
    sig("aside", "Sidebar content", 0.88, { tag: "aside" }),
  ];

  const structuredDataSigs: EvidenceSignal[] = [
    sig("json_ld", "Article", 0.95, { schemaType: "Article", format: "json_ld" }),
    sig("json_ld", "BreadcrumbList", 0.94, { schemaType: "BreadcrumbList", format: "json_ld" }),
    sig("json_ld", "Organization", 0.93, { schemaType: "Organization", format: "json_ld" }),
  ];

  const accessibilitySigs: EvidenceSignal[] = [
    sig("img_alt", "Diagram showing the machine learning pipeline", 0.88, { alt: "Diagram showing the machine learning pipeline", isDescriptive: true }),
    sig("img_alt", "Chart comparing supervised and unsupervised learning", 0.87, { alt: "Chart comparing supervised and unsupervised learning", isDescriptive: true }),
    sig("aria_landmark", "main", 0.90, { role: "main" }),
    sig("semantic_landmark", "main (main)", 0.88, { tag: "main", impliedRole: "main" }),
    sig("aria_label", "Search this site", 0.85, { ariaLabel: "Search this site" }),
    sig("skip_link", "Skip to main content", 0.92, { hasSkipLink: true }),
  ];

  const entitySigs: EvidenceSignal[] = [
    sig("entity_person", "Alan Turing", 0.85, { entityType: "person" }),
    sig("entity_organization", "Google DeepMind", 0.84, { entityType: "organization" }),
    sig("entity_location", "Mountain View, California", 0.83, { entityType: "location" }),
    sig("entity_date", "2024-01-15", 0.82, { entityType: "date" }),
    sig("entity_product", "TensorFlow", 0.83, { entityType: "product" }),
    sig("entity_quantity", "100 million parameters", 0.80, { entityType: "quantity" }),
    sig("entity_person", "Geoffrey Hinton", 0.84, { entityType: "person" }),
    sig("entity_organization", "OpenAI", 0.84, { entityType: "organization" }),
  ];

  const hierarchy: HierarchyNode = {
    tag: "html",
    level: 0,
    text: "",
    selector: "html",
    children: [
      {
        tag: "h1",
        level: 1,
        text: "Understanding Machine Learning",
        selector: "body > article > h1",
        children: [
          {
            tag: "h2",
            level: 2,
            text: "Introduction to Machine Learning",
            selector: "body > article > section:nth-child(1) > h2",
            children: [
              { tag: "h3", level: 3, text: "Supervised Learning", selector: "body > article > section:nth-child(1) > section:nth-child(1) > h3", children: [] },
              { tag: "h3", level: 3, text: "Unsupervised Learning", selector: "body > article > section:nth-child(1) > section:nth-child(2) > h3", children: [] },
            ],
          },
          {
            tag: "h2",
            level: 2,
            text: "Applications of Machine Learning",
            selector: "body > article > section:nth-child(2) > h2",
            children: [
              { tag: "h3", level: 3, text: "Natural Language Processing", selector: "body > article > section:nth-child(2) > section:nth-child(1) > h3", children: [] },
              { tag: "h3", level: 3, text: "Computer Vision", selector: "body > article > section:nth-child(2) > section:nth-child(2) > h3", children: [] },
            ],
          },
        ],
      },
    ],
  };

  return {
    url: "https://example.com/ml-guide",
    timestamp: Date.now(),
    metadata: {
      title: "Understanding Machine Learning: A Comprehensive Guide",
      description: "A comprehensive guide to machine learning covering supervised, unsupervised, and reinforcement learning.",
      canonical: "https://example.com/ml-guide",
      language: "en",
      ogTitle: "Understanding Machine Learning",
      ogDescription: "A comprehensive guide to ML",
      ogType: "article",
    },
    headings: [section("headings", "Headings", headingSigs)],
    paragraphs: [section("paragraphs", "Paragraphs", paragraphSigs)],
    lists: [section("lists", "Lists", listSigs)],
    tables: [],
    links: [section("links", "Links", [sig("a", "Learn more about TensorFlow", 0.85, { href: "https://tensorflow.org" })])],
    accessibility: [section("accessibility", "Accessibility", accessibilitySigs)],
    structuredData: [section("structuredData", "Structured Data", structuredDataSigs)],
    semantic: [section("semantic", "Semantic HTML", semanticSigs)],
    semanticStructure: [section("semanticStructure", "Semantic Structure", semanticSigs)],
    structuredContent: [],
    extractability: [section("extractability", "Extractability", [
      sig("content_density", "75.0%", 0.9, { contentDensity: 0.75, fullTextLength: 4000, mainTextLength: 3000 }),
      sig("noise_ratio", "15.0%", 0.85, { noiseRatio: 0.15, noiseTextLength: 600 }),
      sig("boilerplate_detection", "1 boilerplate regions", 0.75, { boilerplateElements: 1 }),
      sig("repeated_blocks", "0 repeated blocks (0% of 10)", 0.8, { repeatedBlocks: 0, totalBlocks: 10 }),
      sig("extractable_region", "article (3500 chars)", 0.85, { tag: "article", textLength: 3500 }),
    ])],
    redundancy: [section("redundancy", "Redundancy", [])],
    domainProfile: [section("domainProfile", "Domain Profile", [sig("blog", "blog: score 8", 0.85, { domainType: "blog", score: 8, isPrimary: true })])],
    entities: [section("entities", "Entities", entitySigs)],
    anchorText: [section("anchorText", "Anchor Text", [sig("anchor", "Learn more about TensorFlow", 0.85)])],
    absence: [],
    contamination: false,
    diagnostics: {
      hydrationShell: false,
      shadowDom: false,
      scriptOnlyDom: false,
      boilerplateOnly: false,
      oversizedHtml: false,
      encodingFailure: false,
      malformedDom: false,
      visibleTextLength: 3500,
      mainContentFound: true,
    },
    hierarchy,
  };
}

// ─── Mock Evidence: Empty HTML Page ─────────────────────────────────

function createEmptyEvidence(): AceEvidenceResult {
  return {
    url: "https://example.com/empty",
    timestamp: Date.now(),
    metadata: {},
    headings: [],
    paragraphs: [],
    lists: [],
    tables: [],
    links: [],
    accessibility: [],
    structuredData: [],
    semantic: [],
    semanticStructure: [],
    structuredContent: [],
    extractability: [],
    redundancy: [],
    domainProfile: [],
    entities: [],
    anchorText: [],
    absence: [section("absence", "Absence", [
      sig("title", "Missing: title", 1.0, { category: "title", severity: "critical" }),
      sig("h1", "Missing: h1", 1.0, { category: "primary_heading", severity: "critical" }),
      sig("meta_description", "Missing: meta_description", 1.0, { category: "meta_description", severity: "critical" }),
      sig("main_landmark", "Missing: main_landmark", 1.0, { category: "main_landmark", severity: "critical" }),
      sig("json_ld", "Missing: json_ld", 1.0, { category: "structured_data", severity: "warning" }),
      sig("img_alt", "Missing: img_alt", 1.0, { category: "image_alt_text", severity: "warning" }),
    ])],
    contamination: true,
    contaminationType: "fetch_failure",
    diagnostics: {
      hydrationShell: false,
      shadowDom: false,
      scriptOnlyDom: false,
      boilerplateOnly: false,
      oversizedHtml: false,
      encodingFailure: false,
      malformedDom: false,
      visibleTextLength: 0,
      mainContentFound: false,
    },
    hierarchy: null,
  };
}

// ─── Mock Evidence: Script-Only SPA Shell ───────────────────────────

function createScriptOnlyEvidence(): AceEvidenceResult {
  return {
    url: "https://example.com/spa",
    timestamp: Date.now(),
    metadata: { title: "SPA App" },
    headings: [],
    paragraphs: [],
    lists: [],
    tables: [],
    links: [],
    accessibility: [],
    structuredData: [],
    semantic: [],
    semanticStructure: [],
    structuredContent: [],
    extractability: [section("extractability", "Extractability", [
      sig("content_density", "5.0%", 0.9, { contentDensity: 0.05, fullTextLength: 200, mainTextLength: 10 }),
      sig("noise_ratio", "95.0%", 0.85, { noiseRatio: 0.95, noiseTextLength: 190 }),
    ])],
    redundancy: [],
    domainProfile: [],
    entities: [],
    anchorText: [],
    absence: [section("absence", "Absence", [
      sig("h1", "Missing: h1", 1.0, { category: "primary_heading", severity: "critical" }),
      sig("main_landmark", "Missing: main_landmark", 1.0, { category: "main_landmark", severity: "critical" }),
      sig("meta_description", "Missing: meta_description", 1.0, { category: "meta_description", severity: "critical" }),
      sig("json_ld", "Missing: json_ld", 1.0, { category: "structured_data", severity: "warning" }),
    ])],
    contamination: true,
    contaminationType: "script_only_dom",
    contaminationFlags: ["script_only_dom"],
    diagnostics: {
      hydrationShell: true,
      shadowDom: false,
      scriptOnlyDom: true,
      boilerplateOnly: false,
      oversizedHtml: false,
      encodingFailure: false,
      malformedDom: false,
      visibleTextLength: 10,
      mainContentFound: false,
    },
    hierarchy: null,
  };
}

// ─── Mock Evidence: Missing JSON-LD ─────────────────────────────────

function createMissingJsonLdEvidence(): AceEvidenceResult {
  const perfect = createPerfectEvidence();
  // Remove structured data but keep everything else
  return {
    ...perfect,
    url: "https://example.com/no-jsonld",
    structuredData: [],
    absence: [section("absence", "Absence", [
      sig("json_ld", "Missing: json_ld", 1.0, { category: "structured_data", severity: "warning" }),
    ])],
  };
}

// ─── Mock Evidence: No Headings ─────────────────────────────────────

function createNoHeadingsEvidence(): AceEvidenceResult {
  const perfect = createPerfectEvidence();
  return {
    ...perfect,
    url: "https://example.com/no-headings",
    headings: [],
    hierarchy: null,
    absence: [section("absence", "Absence", [
      sig("h1", "Missing: h1", 1.0, { category: "primary_heading", severity: "critical" }),
    ])],
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("ACE v1.2 Scoring Engine", () => {
  describe("Test Case 1: Perfect semantic webpage", () => {
    it("should produce a high finalScore and high confidence", () => {
      const evidence = createPerfectEvidence();
      const score = runAceScoringPipeline(evidence);

      expect(score).toBeDefined();
      expect(score.finalScore).not.toBeNull();
      expect(score.confidence).not.toBeNull();
      expect(score.finalScore!).toBeGreaterThan(60);
      expect(score.confidence!).toBeGreaterThan(0.5);
      expect(score.status).toBe("scored");
      expect(score.version.scoring).toBe("1.2.0");
    });

    it("should have all 12 metrics scored", () => {
      const evidence = createPerfectEvidence();
      const score = runAceScoringPipeline(evidence);

      const metricKeys = [
        "readability", "structure", "clarity", "consistency",
        "semantic", "completeness", "semanticStructure", "structuredData",
        "extractability", "accessibility", "entityRecognition", "machineComprehension",
      ] as const;

      for (const key of metricKeys) {
        expect(score.metrics[key]).toBeDefined();
        expect(score.metrics[key].metric).toBe(key);
      }
    });

    it("should have high structuredData score with JSON-LD present", () => {
      const evidence = createPerfectEvidence();
      const score = runAceScoringPipeline(evidence);

      expect(score.metrics.structuredData.score).not.toBeNull();
      expect(score.metrics.structuredData.score!).toBeGreaterThan(60);
    });
  });

  describe("Test Case 2: Empty HTML page", () => {
    it("should return status = insufficient_evidence", () => {
      const evidence = createEmptyEvidence();
      const score = runAceScoringPipeline(evidence);

      expect(score.status).toBe("insufficient_evidence");
      expect(score.finalScore).toBeNull();
      expect(score.confidence).toBeNull();
    });

    it("should have diagnostics explaining the insufficient evidence", () => {
      const evidence = createEmptyEvidence();
      const score = runAceScoringPipeline(evidence);

      // ACE v1.2: Contamination blocks scoring — metrics is empty, diagnostics.contamination is true
      expect(score.diagnostics.contamination).toBe(true);
      expect(score.diagnostics.contaminationType).toBeDefined();
      // Scoring warnings should note that scoring was blocked
      expect(score.diagnostics.scoringWarnings.length).toBeGreaterThan(0);
    });
  });

  describe("Test Case 3: Script-only SPA shell", () => {
    it("should detect contamination and block scoring (ACE v1.2)", () => {
      const evidence = createScriptOnlyEvidence();
      const score = runAceScoringPipeline(evidence);

      expect(score.diagnostics.contamination).toBe(true);
      // ACE v1.2: Critical contamination blocks scoring entirely
      expect(score.status).toBe("insufficient_evidence");
      expect(score.finalScore).toBeNull();
      expect(score.confidence).toBeNull();
      // Metrics should be empty — no calculators ran
      expect(Object.keys(score.metrics).length).toBe(0);
    });
  });

  describe("Test Case 4: Missing JSON-LD", () => {
    it("should have structuredData weaknesses and reduced score", () => {
      const evidence = createMissingJsonLdEvidence();
      const score = runAceScoringPipeline(evidence);

      // Structured Data should be insufficient (no signals)
      expect(score.metrics.structuredData.status).toBe("insufficient_evidence");
      expect(score.metrics.structuredData.score).toBeNull();
      // Should have a weakness mentioning missing JSON-LD or structured data
      expect(score.metrics.structuredData.weaknesses.length).toBeGreaterThan(0);
    });
  });

  describe("Test Case 5: No headings", () => {
    it("should penalize Structure and Semantic Structure metrics", () => {
      const evidence = createNoHeadingsEvidence();
      const score = runAceScoringPipeline(evidence);

      // Structure should be insufficient (no headings)
      expect(score.metrics.structure.status).toBe("insufficient_evidence");
      expect(score.metrics.structure.score).toBeNull();

      // Semantic Structure should have weaknesses mentioning missing hierarchy or orphans
      const ssWeaknesses = score.metrics.semanticStructure.weaknesses;
      expect(ssWeaknesses.some((w) => w.includes("orphan") || w.includes("hierarchy") || w.includes("heading") || w.includes("Absence"))).toBe(true);

      // The overall final score should be lower due to the Structure metric being null
      // and critical absence (primary_heading) should trigger absence dominance
      expect(["scored_absence_evidence", "insufficient_evidence"]).toContain(score.status);
    });
  });

  describe("Test Case 6: Deterministic repeat scoring", () => {
    it("should produce identical ACEScore output for same input across multiple runs", () => {
      const evidence = createPerfectEvidence();

      // Run the pipeline 3 times
      const score1 = runAceScoringPipeline(evidence);
      const score2 = runAceScoringPipeline(evidence);
      const score3 = runAceScoringPipeline(evidence);

      // Compare final scores
      expect(score2.finalScore).toBe(score1.finalScore);
      expect(score3.finalScore).toBe(score1.finalScore);

      // Compare confidence
      expect(score2.confidence).toBe(score1.confidence);
      expect(score3.confidence).toBe(score1.confidence);

      // Compare status
      expect(score2.status).toBe(score1.status);
      expect(score3.status).toBe(score1.status);

      // Compare all metric scores
      const metricKeys = [
        "readability", "structure", "clarity", "consistency",
        "semantic", "completeness", "semanticStructure", "structuredData",
        "extractability", "accessibility", "entityRecognition", "machineComprehension",
      ] as const;

      for (const key of metricKeys) {
        expect(score2.metrics[key].score).toBe(score1.metrics[key].score);
        expect(score3.metrics[key].score).toBe(score1.metrics[key].score);
        expect(score2.metrics[key].confidence).toBe(score1.metrics[key].confidence);
      }

      // Compare weighting profiles
      expect(score2.weightingProfile).toEqual(score1.weightingProfile);
      expect(score3.weightingProfile).toEqual(score1.weightingProfile);
    });
  });

  describe("Weighting Engine", () => {
    it("default weights should sum to 1.0", () => {
      const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
      expect(Math.abs(sum - 1.0)).toBeLessThan(0.001);
    });

    it("should use default weights when no custom profile provided", () => {
      const evidence = createPerfectEvidence();
      const score = runAceScoringPipeline(evidence);
      expect(score.weightingProfile).toEqual(DEFAULT_WEIGHTS);
    });
  });

  describe("scoreNormalizedEvidence (direct normalized input)", () => {
    it("should accept a NormalizedEvidenceResult directly", () => {
      const normalized: NormalizedEvidenceResult = {
        url: "https://example.com/test",
        timestamp: Date.now(),
        normalizedText: "This is a test sentence. This is another sentence for testing purposes.",
        headings: [nsection("headings", [nsig("h1", "Test Heading", 0.9, { level: 1 })])],
        paragraphs: [nsection("paragraphs", [nsig("p", "This is a test paragraph with enough content for analysis.", 0.88)])],
        lists: [],
        tables: [],
        links: [],
        semantic: [nsection("semantic", [nsig("main", "Main content", 0.9, { normalizedTag: "main" })])],
        semanticStructure: [nsection("semanticStructure", [nsig("section", "Section content", 0.88, { tag: "section" })])],
        structuredContent: [],
        domainProfile: [],
        entities: [nsection("entities", [nsig("entity_person", "John Doe", 0.85, { entityType: "person" })])],
        accessibility: [nsection("accessibility", [nsig("img_alt", "Test image alt text", 0.88, { alt: "Test image alt text" })])],
        structuredData: [nsection("structuredData", [nsig("json_ld", "Article", 0.95, { schemaType: "Article" })])],
        extractability: [nsection("extractability", [
          nsig("content_density", "80.0%", 0.9, { contentDensity: 0.8 }),
          nsig("noise_ratio", "10.0%", 0.85, { noiseRatio: 0.1 }),
          nsig("extractable_region", "article (2000 chars)", 0.85, { tag: "article", textLength: 2000 }),
          nsig("extractability_assessment", "extractable", 0.9, { overallExtractability: true, contentDensity: 0.8, noiseRatio: 0.1 }),
        ])],
        redundancy: [],
        absence: [],
        hierarchy: null,
        contamination: false,
        normalizedSentences: ["This is a test sentence.", "This is another sentence for testing purposes."],
        normalizedWords: ["This", "is", "a", "test", "sentence", "This", "is", "another", "sentence", "for", "testing", "purposes"],
        normalizedParagraphTokens: [["This", "is", "a", "test", "paragraph"]],
        normalizedListTokens: [],
        normalizedTableTokens: [],
        normalizationWarnings: [],
        normalizationErrors: [],
      };

      const score = scoreNormalizedEvidence(normalized);

      expect(score).toBeDefined();
      expect(score.finalScore).not.toBeNull();
      expect(score.status).toBe("scored");
    });
  });
});
