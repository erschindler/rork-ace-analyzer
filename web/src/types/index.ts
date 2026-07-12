/**
 * ACE Analyzer — Core Type Definitions
 * Phase 1: Type scaffolding. All fields defined but optional.
 * Phase 2 will tighten required fields once modules are implemented.
 */

// ─── Evidence Layer ────────────────────────────────────────────────

/** A single piece of raw evidence extracted from a webpage. */
export interface EvidenceObject {
  id?: string;
  /** Source URL the evidence was extracted from. */
  sourceUrl?: string;
  /** Category of evidence (e.g. "meta", "headings", "schema", "links"). */
  category?: string;
  /** Raw selector or path where evidence was found. */
  selector?: string;
  /** Extracted value / content. */
  value?: string;
  /** Confidence weight 0–1 for extraction reliability. */
  confidence?: number;
  /** Timestamp of extraction. */
  extractedAt?: string;
  /** Additional structured metadata. */
  metadata?: Record<string, unknown>;
}

/** A single signal within an evidence section. */
export interface EvidenceSignal {
  /** Signal type identifier (e.g. "h1", "meta_description", "json_ld"). */
  type: string;
  /** Extracted value / content. */
  value: string;
  /** Confidence 0–1 for extraction reliability. */
  confidence: number;
  /** CSS selector path where the signal was found. */
  selector?: string;
  /** Additional structured metadata for this signal. */
  metadata?: Record<string, unknown>;
}

/** A section of related evidence signals (e.g. all headings, all links). */
export interface EvidenceSection {
  /** Section category identifier. */
  category: string;
  /** Human-readable label for the section. */
  label: string;
  /** Signals within this section. */
  signals: EvidenceSignal[];
  /** Number of signals. */
  count: number;
  /** Aggregate confidence 0–1 for the section. */
  confidence: number;
  /** Section-level metadata. */
  metadata?: Record<string, unknown>;
}

/** Page-level metadata evidence extracted from <head> and meta tags. */
export interface EvidenceMetadata {
  title?: string;
  description?: string;
  canonical?: string;
  language?: string;
  charset?: string;
  viewport?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  ogUrl?: string;
  ogSiteName?: string;
  twitterCard?: string;
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
  author?: string;
  keywords?: string;
  robots?: string;
  generator?: string;
  favicon?: string;
  themeColor?: string;
  contentType?: string;
  contentLength?: number;
  [key: string]: unknown;
}

/** A node in the document's semantic hierarchy. */
export interface HierarchyNode {
  tag: string;
  level: number;
  text: string;
  selector: string;
  children: HierarchyNode[];
  attributes?: Record<string, string>;
}

/** Diagnostics from the extraction process for developer mode. */
export interface ExtractionDiagnostics {
  fetchStatus?: number;
  fetchError?: string;
  htmlSize?: number;
  parseErrors?: string[];
  hydrationShell: boolean;
  shadowDom: boolean;
  scriptOnlyDom: boolean;
  boilerplateOnly: boolean;
  oversizedHtml: boolean;
  encodingFailure: boolean;
  malformedDom: boolean;
  visibleTextLength: number;
  mainContentFound: boolean;
  /** DOM corruption detected — body only scripts, parsererror, too few text nodes, etc. */
  domCorruption?: boolean;
  /** DOM corruption reason if detected. */
  domCorruptionReason?: string;
  /** Truncated HTML detected. */
  truncatedHtml?: boolean;
  /** Contamination diagnostics summary from the central collector. */
  contaminationDiagnostics?: ContaminationDiagnosticsSummary;
  /** Rendering diagnostics — JS execution, lazy-load, Elementor detection. */
  rendering?: RenderingDiagnostics;
  /** Structural consistency check results across extractors. */
  structuralConsistency?: StructuralConsistencyDiagnostics;
}

/** Diagnostics for the rendered DOM extraction process. */
export interface RenderingDiagnostics {
  /** Whether rendered DOM extraction was used (iframe rendering). */
  rendered: boolean;
  /** Whether lazy-load scrolling was performed. */
  lazyLoadTriggered: boolean;
  /** Whether Elementor was detected. */
  elementorDetected: boolean;
  /** Number of scroll steps performed. */
  scrollSteps: number;
  /** Content growth from rendering (visible text chars gained). */
  contentGrowth: number;
  /** Error message if rendering failed. */
  renderingError?: string;
}

/** Structural consistency validation across extractors. */
export interface StructuralConsistencyDiagnostics {
  /** Heading count from headingExtractor. */
  headingExtractorCount: number;
  /** Heading count from hierarchy builder. */
  hierarchyHeadingCount: number;
  /** Heading count from semanticStructure extractor. */
  semanticStructureHeadingCount: number;
  /** Whether heading counts are consistent. */
  headingsConsistent: boolean;
  /** Paragraph count from paragraphExtractor. */
  paragraphExtractorCount: number;
  /** Visible text length from extractability analyzer. */
  extractabilityTextLength: number;
  /** Whether there are contradictions. */
  hasContradictions: boolean;
  /** Description of any contradictions found. */
  contradictions: string[];
}

/** A single contamination diagnostic record from the pipeline. */
export interface ContaminationDiagnosticRecord {
  source: "fetcher" | "dom_parser" | "contamination_detector" | "evidence_layer" | "normalization" | "scoring";
  type: string;
  reason: string;
  severity: "critical" | "warning" | "info";
  blocksScoring: boolean;
  detail?: Record<string, unknown>;
}

/** Serializable summary of contamination diagnostics across pipeline phases. */
export interface ContaminationDiagnosticsSummary {
  hasContamination: boolean;
  hasBlockingContamination: boolean;
  primaryType: string | undefined;
  flags: string[];
  records: ContaminationDiagnosticRecord[];
  fetchFailureReason: string | undefined;
  domCorruptionReason: string | undefined;
  hydrationShellDetected: boolean;
  scriptOnlyDomDetected: boolean;
  shadowDomDetected: boolean;
  boilerplateDetected: boolean;
  parserErrors: string[];
  encodingFailureDetected: boolean;
}

/** The complete evidence extraction result from a single target. */
export interface AceEvidenceResult {
  url: string;
  timestamp: number;
  metadata: EvidenceMetadata;
  headings: EvidenceSection[];
  paragraphs: EvidenceSection[];
  lists: EvidenceSection[];
  tables: EvidenceSection[];
  links: EvidenceSection[];
  accessibility: EvidenceSection[];
  structuredData: EvidenceSection[];
  semantic: EvidenceSection[];
  semanticStructure: EvidenceSection[];
  structuredContent: EvidenceSection[];
  extractability: EvidenceSection[];
  redundancy: EvidenceSection[];
  domainProfile: EvidenceSection[];
  entities: EvidenceSection[];
  anchorText: EvidenceSection[];
  hierarchy: HierarchyNode | null;
  absence: EvidenceSection[];
  contamination: boolean;
  contaminationType?: string;
  contaminationFlags?: string[];
  diagnostics?: ExtractionDiagnostics;
  /** Full visible text from the document body (excluding scripts/styles). Used for accurate word counts. */
  rawVisibleText?: string;
}

/** Evidence after normalization — deduped, scored, categorized. */
export interface NormalizedEvidence {
  id?: string;
  /** Grouped category key. */
  category?: string;
  /** Normalized label / human-readable name. */
  label?: string;
  /** Canonical value after normalization. */
  normalizedValue?: string;
  /** Original evidence references. */
  sourceEvidenceIds?: string[];
  /** Normalization confidence 0–1. */
  confidence?: number;
  /** Flags raised during normalization. */
  flags?: string[];
  metadata?: Record<string, unknown>;
}

// ─── Normalization Layer (Phase 3) ────────────────────────────────

/** A single normalized signal within a normalized section. */
export interface NormalizedSignal {
  /** Signal type identifier (e.g. "h1", "semantic_p", "entity_person"). */
  type: string;
  /** Normalized value — whitespace, punctuation, casing standardized. */
  value: string;
  /** Confidence 0–1 inherited from source signal, adjusted by normalization. */
  confidence: number;
  /** Original source signal selector (if available). */
  selector?: string;
  /** Normalized metadata. */
  metadata?: Record<string, unknown>;
  /** Whether this signal was deduplicated. */
  isDuplicate?: boolean;
  /** Whether this signal was derived from contaminated evidence. */
  isContaminated?: boolean;
}

/** A normalized section of related evidence. */
export interface NormalizedSection {
  /** Deterministic section ID (e.g. "headings_0", "semantic_1"). */
  id: string;
  /** Section type (e.g. "headings", "paragraphs", "semantic"). */
  type: string;
  /** Normalized content — concatenated normalized signal values. */
  normalizedContent: string;
  /** Normalized signals within this section. */
  normalizedSignals: NormalizedSignal[];
  /** Original source section category (if traceable). */
  sourceSectionId?: string;
  /** Number of signals before deduplication. */
  originalCount?: number;
  /** Number of duplicates removed. */
  duplicatesRemoved?: number;
  /** Section-level normalization confidence. */
  confidence?: number;
}

/** Normalized hierarchy node. */
export interface NormalizedHierarchyNode {
  tag: string;
  level: number;
  text: string;
  normalizedText: string;
  selector: string;
  children: NormalizedHierarchyNode[];
  attributes?: Record<string, string>;
  isOrphan?: boolean;
  depthFromRoot?: number;
}

/** Normalized token arrays for text analysis. */
export interface NormalizedTokens {
  sentences: string[];
  words: string[];
  paragraphTokens: string[][];
  listTokens: string[][];
  tableTokens: string[][];
}

/** Complete normalized evidence result from the normalization layer. */
export interface NormalizedEvidenceResult {
  url: string;
  timestamp: number;
  normalizedText: string;

  headings: NormalizedSection[];
  paragraphs: NormalizedSection[];
  lists: NormalizedSection[];
  tables: NormalizedSection[];
  links: NormalizedSection[];

  semantic: NormalizedSection[];
  semanticStructure: NormalizedSection[];
  structuredContent: NormalizedSection[];
  domainProfile: NormalizedSection[];
  entities: NormalizedSection[];

  accessibility: NormalizedSection[];
  structuredData: NormalizedSection[];

  extractability: NormalizedSection[];
  redundancy: NormalizedSection[];
  absence: NormalizedSection[];

  hierarchy: NormalizedHierarchyNode | null;

  contamination: boolean;
  contaminationType?: string;

  normalizedSentences: string[];
  normalizedWords: string[];
  normalizedParagraphTokens: string[][];
  normalizedListTokens: string[][];
  normalizedTableTokens: string[][];

  normalizationWarnings: string[];
  normalizationErrors: string[];
}

// ─── Scoring Layer (Phase 4 — ACE v1.2) ────────────────────────────

/** ACE scoring version metadata. */
export interface ScoringVersion {
  scoring: string;
  metrics: string;
  weighting: string;
  normalization: string;
  evidence: string;
}

/** A recommendation produced by a metric calculator. */
export interface Recommendation {
  id: string;
  category: "structure" | "semantic" | "accessibility" | "extractability" | "content" | "metadata";
  priority: "high" | "medium" | "low";
  message: string;
}

/** Calculation breakdown for a metric score. */
export interface MetricCalculation {
  inputs: Record<string, unknown>;
  components: Record<string, number>;
  formula: string;
  result: number | null;
}

/** A single metric score within the ACE v1.2 framework. */
export interface MetricScore {
  metric: string;
  /** Numeric score 0–100, or null when insufficient evidence. */
  score: number | null;
  /** Confidence 0–1, or null when insufficient evidence. */
  confidence: number | null;
  /** Evidence excerpts supporting this score. */
  evidence: string[];
  /** Weaknesses identified during scoring. */
  weaknesses: string[];
  /** Actionable recommendations. */
  recommendations: Recommendation[];
  /** Whether the metric was scored or had insufficient evidence. */
  status: "scored" | "insufficient_evidence";
  /** Full calculation breakdown. */
  calculation: MetricCalculation;
}

/** Scoring diagnostics for the ACE pipeline. */
export interface ScoringDiagnostics {
  missingEvidence: string[];
  absenceEvidence: string[];
  contamination: boolean;
  contaminationType?: string;
  normalizationWarnings: string[];
  scoringWarnings: string[];
}

/** ACE v1.2 weighting profile. */
export interface WeightingProfile {
  readability: number;
  structure: number;
  clarity: number;
  consistency: number;
  semantic: number;
  completeness: number;
  semanticStructure: number;
  structuredData: number;
  extractability: number;
  accessibility: number;
  entityRecognition: number;
  machineComprehension: number;
}

/** The composite ACE v1.2 score (ACEScore). */
export interface ACEScore {
  version: ScoringVersion;
  timestamp: number;
  url: string;
  /** Final ACE score (MCR) 0–100, or null when insufficient evidence. */
  finalScore: number | null;
  /** Overall confidence 0–1, or null when insufficient evidence. */
  confidence: number | null;
  /** Per-metric scores keyed by metric name. */
  metrics: {
    readability: MetricScore;
    structure: MetricScore;
    clarity: MetricScore;
    consistency: MetricScore;
    semantic: MetricScore;
    completeness: MetricScore;
    semanticStructure: MetricScore;
    structuredData: MetricScore;
    extractability: MetricScore;
    accessibility: MetricScore;
    entityRecognition: MetricScore;
    machineComprehension: MetricScore;
  };
  /** Weighting profile used for scoring. */
  weightingProfile: WeightingProfile;
  /** ACE 3-state model status. */
  status: "scored" | "scored_absence_evidence" | "insufficient_evidence";
  /** Scoring diagnostics. */
  diagnostics: ScoringDiagnostics;
}

/** Legacy metric score type retained for backward compatibility with older UI components. */
export interface LegacyMetricScore {
  metricId?: string;
  name?: string;
  score?: number;
  weight?: number;
  weightedScore?: number;
  grade?: string;
  description?: string;
  evidenceIds?: string[];
  deductions?: ScoreDeduction[];
}

/** A deduction applied to a metric score (legacy support). */
export interface ScoreDeduction {
  ruleId?: string;
  description?: string;
  points?: number;
  severity?: "info" | "warning" | "critical";
}

// ─── Reporting Layer (Phase 5 — ACE v1.2) ───────────────────────────

/** ACE version metadata for all report types. */
export interface AceVersionMetadata {
  evidence: string;
  normalization: string;
  scoring: string;
  metrics: string;
  weighting: string;
  reporting: string;
  schema: string;
}

/** A single metric's report-ready representation. */
export interface MetricReport {
  /** Metric key (e.g. "readability", "structure"). */
  metric: string;
  /** Human-readable metric name. */
  displayName: string;
  /** Numeric score 0–100, or null when insufficient evidence. */
  score: number | null;
  /** Confidence 0–1, or null when insufficient evidence. */
  confidence: number | null;
  /** Scoring status. */
  status: "scored" | "insufficient_evidence";
  /** Formula string from calculation. */
  formula: string;
  /** Component score breakdowns. */
  components: Record<string, number>;
  /** Calculation inputs (JSON-safe). */
  inputs: Record<string, unknown>;
  /** Evidence excerpts supporting this score. */
  evidence: string[];
  /** Weaknesses identified during scoring. */
  weaknesses: string[];
  /** Recommendations for this metric. */
  recommendations: Recommendation[];
}

/** Full ACE Report (user-facing). */
export interface AceReport {
  version: AceVersionMetadata;
  url: string;
  timestamp: number;
  finalScore: number | null;
  confidence: number | null;
  status: "scored" | "scored_absence_evidence" | "insufficient_evidence";
  metrics: Record<string, MetricReport>;
  weightingProfile: Record<string, number>;
  absenceEvidence: string[];
  contamination: boolean;
  contaminationType?: string;
  topRecommendations: Recommendation[];
  /** Contamination diagnostics summary (present when contamination was detected). */
  contaminationDiagnostics?: ContaminationDiagnosticsSummary;
}

/** Developer Report (engineering-facing). */
export interface DeveloperReport {
  version: AceVersionMetadata;
  url: string;
  timestamp: number;
  evidence: AceEvidenceResult;
  normalized: NormalizedEvidenceResult;
  score: ACEScore;
  diagnostics: {
    normalizationWarnings: string[];
    scoringWarnings: string[];
    pipelineWarnings: string[];
    /** Contamination diagnostics from Phase 2/3. */
    contaminationDiagnostics?: ContaminationDiagnosticsSummary;
    /** Whether scoring was skipped due to contamination. */
    scoringSkipped: boolean;
    /** Reason scoring was skipped, if applicable. */
    scoringSkipReason?: string;
  };
}

/** Summary Report (lightweight). */
export interface AceSummaryReport {
  version: AceVersionMetadata;
  url: string;
  timestamp: number;
  finalScore: number | null;
  confidence: number | null;
  status: string;
  topRecommendations: Recommendation[];
  weaknesses: string[];
}

/** A generated audit report (legacy support). */
export interface ReportObject {
  id?: string;
  auditId?: string;
  format?: string;
  content?: string | Record<string, unknown>;
  summary?: string;
  findings?: ReportFinding[];
  recommendations?: string[];
  generatedAt?: string;
}

/** A single finding in a report (legacy support). */
export interface ReportFinding {
  title?: string;
  severity?: "info" | "warning" | "critical";
  description?: string;
  affectedMetrics?: string[];
}

// ─── Benchmark Layer (Phase 6 — ACE Benchmarking) ──────────────────

/** A benchmark run against a set of URLs (legacy support). */
export interface BenchmarkRun {
  id?: string;
  label?: string;
  source?: string;
  urls?: string[];
  totalUrls?: number;
  completedUrls?: number;
  status?: "pending" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;
  aggregateScore?: number;
  results?: LegacyBenchmarkResult[];
  startedAt?: string;
  completedAt?: string;
}

/** Legacy per-URL result within a benchmark run. */
export interface LegacyBenchmarkResult {
  url?: string;
  aceScore?: number;
  grade?: string;
  metrics?: MetricScore[];
  status?: "pass" | "fail" | "error";
}

/** Expected benchmark outcome for a test case. */
export interface BenchmarkExpectations {
  minScore?: number;
  maxScore?: number;
  minConfidence?: number;
  status?: "scored" | "scored_absence_evidence" | "insufficient_evidence";
  hasContamination?: boolean;
  hasWeaknesses?: string[];
}

/** A single benchmark test case. */
export interface BenchmarkCase {
  id: string;
  category: string;
  url?: string;
  snapshotHtml?: string;
  expectedType?: string;
  tags?: string[];
  notes?: string;
  expected?: BenchmarkExpectations;
}

/** A collection of benchmark cases. */
export interface BenchmarkCorpus {
  cases: BenchmarkCase[];
  totalCount: number;
}

/** Generic corpus provider interface. */
export interface BenchmarkCorpusProvider {
  load(): Promise<BenchmarkCorpus>;
}

/** Result of running a single benchmark case. */
export interface BenchmarkResult {
  caseId: string;
  category: string;
  mode: "regression" | "live";
  score: ACEScore | null;
  report: AceReport | null;
  summary: AceSummaryReport | null;
  status: "ok" | "error";
  errorMessage?: string;
  executionTimeMs: number;
}

/** Summary for a category of benchmark results. */
export interface CategoryBenchmarkSummary {
  category: string;
  total: number;
  passed: number;
  failed: number;
  driftDetected: number;
}

/** Performance metrics across a benchmark run. */
export interface BenchmarkPerformance {
  averageRuntimeMs: number;
  medianRuntimeMs: number;
  slowestPageId: string;
  fastestPageId: string;
}

/** Summary across all sites in a multi-site benchmark. */
export interface MultiSiteBenchmarkSummary {
  totalSites: number;
  passed: number;
  failed: number;
  driftDetected: number;
  categories: Record<string, CategoryBenchmarkSummary>;
  performance: BenchmarkPerformance;
}

/** Full multi-site benchmark result. */
export interface MultiSiteBenchmarkResult {
  corpus: BenchmarkCorpus;
  results: BenchmarkResult[];
  summary: MultiSiteBenchmarkSummary;
}

/** Stored baseline for regression comparison. */
export interface BenchmarkBaseline {
  aceVersion: string;
  benchmarkVersion: string;
  corpusHash: string;
  version: AceVersionMetadata;
  results: Record<string, BenchmarkResult>;
}

/** Type of drift detected. */
export type DriftType =
  | "score"
  | "confidence"
  | "metric"
  | "recommendation"
  | "absence_evidence"
  | "contamination"
  | "schema";

/** A single drift record between current and baseline. */
export interface DriftRecord {
  caseId: string;
  type: DriftType;
  metric?: string;
  baselineValue: string;
  currentValue: string;
  delta: number;
}

/** Result of regression comparison for a single case. */
export interface RegressionResult {
  caseId: string;
  passed: boolean;
  drift: DriftRecord[];
}

/** Full regression comparison result across a corpus. */
export interface RegressionComparisonResult {
  results: RegressionResult[];
  corpusDrift: boolean;
  corpusDriftReason: string;
  categoriesWithDrift: string[];
  totalCases: number;
  casesWithDrift: number;
}

/** Benchmark summary report. */
export interface BenchmarkSummaryReport {
  version: AceVersionMetadata;
  timestamp: number;
  mode: "regression" | "live";
  corpusHash: string;
  totalSites: number;
  passed: number;
  failed: number;
  averageScore: number | null;
  medianScore: number | null;
  categories: Record<string, CategoryBenchmarkSummary>;
  performance: BenchmarkPerformance;
}

/** Regression report. */
export interface RegressionReport {
  version: AceVersionMetadata;
  timestamp: number;
  corpusHash: string;
  baselineVersion: string;
  totalCases: number;
  casesWithDrift: number;
  corpusDrift: boolean;
  corpusDriftReason: string;
  categoriesWithDrift: string[];
  results: RegressionResult[];
}

/** Drift report. */
export interface DriftReport {
  version: AceVersionMetadata;
  timestamp: number;
  totalDriftRecords: number;
  driftByType: Record<string, number>;
  driftByCategory: Record<string, number>;
  records: DriftRecord[];
}

// ─── Audit Record ──────────────────────────────────────────────────

/** A complete audit record — the primary persisted entity. */
export interface AuditRecord {
  id?: string;
  /** URL or file identifier audited. */
  target?: string;
  /** Type of target ("url" | "file" | "html"). */
  targetType?: string;
  /** ACE score result. */
  score?: ACEScore;
  /** Raw evidence collected. */
  evidence?: EvidenceObject[];
  /** Normalized evidence. */
  normalizedEvidence?: NormalizedEvidence[];
  /** Generated reports. */
  reports?: ReportObject[];
  /** Scoring profile used. */
  scoringProfileId?: string;
  /** Audit status. */
  status?: "pending" | "running" | "completed" | "failed";
  /** Timestamp created. */
  createdAt?: string;
  /** Timestamp completed. */
  completedAt?: string;
  /** Duration in ms. */
  durationMs?: number;
  /** Phase 2: Full evidence extraction result for developer mode. */
  evidenceResult?: import("./index").AceEvidenceResult;
  /** Phase 3: Full normalized evidence result for scoring and developer mode. */
  normalizedEvidenceResult?: import("./index").NormalizedEvidenceResult;
  /** Phase 4: Full ACE v1.2 score result. */
  aceScore?: import("./index").ACEScore;
  /** Phase 5: Full ACE report. */
  aceReport?: import("./index").AceReport;
  /** Phase 5: Developer report. */
  developerReport?: import("./index").DeveloperReport;
  /** Phase 5: Summary report. */
  summaryReport?: import("./index").AceSummaryReport;
}

// ─── Scoring Profile ───────────────────────────────────────────────

/** A weighting profile for ACE scoring. */
export interface ScoringProfile {
  id?: string;
  name?: string;
  description?: string;
  /** Metric weights keyed by metricId. */
  weights?: Record<string, number>;
  /** Whether this is a built-in or custom profile. */
  isBuiltIn?: boolean;
  /** Whether this is the active profile. */
  isActive?: boolean;
  /** Timestamp created. */
  createdAt?: string;
  /** Timestamp updated. */
  updatedAt?: string;
}

// ─── App Config ────────────────────────────────────────────────────

/** Global application configuration. */
export interface AppConfig {
  developerMode?: boolean;
  defaultScoringProfileId?: string;
  exportFormat?: "json" | "html" | "pdf" | "csv";
  benchmarkConcurrency?: number;
  theme?: "dark" | "light";
  /** Future: Supabase migration flag. */
  cloudSyncEnabled?: boolean;
}
