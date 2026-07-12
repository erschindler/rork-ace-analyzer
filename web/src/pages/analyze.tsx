/**
 * Analyze Page — Single webpage auditor with URL input, file upload, and evidence results.
 * Phase 2: Wired to evidence extraction layer.
 */
import { useState, useCallback } from "react";
import { Globe, Upload, FileText, FileJson, Play, Download, Loader2, AlertTriangle, CheckCircle2, Calculator, Award, TrendingUp } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import {
  extractEvidenceFromUrl,
  extractEvidenceFromFile,
  getEvidenceSummary,
} from "@/modules/evidence";
import {
  normalizeEvidence,
  getNormalizedSummary,
} from "@/modules/normalization";
import {
  scoreNormalizedEvidence,
  getAceScoreSummary,
  getGrade,
  DEFAULT_WEIGHTS,
} from "@/modules/scoring";
import {
  generateAceReport,
  generateSummaryReport,
  REPORTING_VERSION,
  SCHEMA_VERSION,
} from "@/modules/reporting";
import type { AceEvidenceResult, NormalizedEvidenceResult, NormalizedSection, ACEScore, MetricScore, AceReport, AceSummaryReport } from "@/types";
import { useHistory } from "@/context";

type AnalysisStatus = "idle" | "analyzing" | "completed" | "error";

export default function AnalyzePage() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AceEvidenceResult | null>(null);
  const [normalized, setNormalized] = useState<NormalizedEvidenceResult | null>(null);
  const [aceScore, setAceScore] = useState<ACEScore | null>(null);
  const [aceReport, setAceReport] = useState<AceReport | null>(null);
  const [summaryReport, setSummaryReport] = useState<AceSummaryReport | null>(null);
  const { addToHistory, setCurrentAudit } = useHistory();

  const runAnalysis = useCallback(async () => {
    if (!url.trim()) {
      setError("Please enter a URL");
      return;
    }

    setStatus("analyzing");
    setError(null);
    setResult(null);
    setNormalized(null);
    setAceScore(null);
    setAceReport(null);
    setSummaryReport(null);

    try {
      const evidence = await extractEvidenceFromUrl(url.trim());
      const normalizedResult = normalizeEvidence(evidence);
      const scoreResult = scoreNormalizedEvidence(normalizedResult);
      const report = generateAceReport(scoreResult, normalizedResult);
      const summary = generateSummaryReport(scoreResult);
      setResult(evidence);
      setNormalized(normalizedResult);
      setAceScore(scoreResult);
      setAceReport(report);
      setSummaryReport(summary);
      setStatus("completed");

      // Add to history
      const auditId = `audit-${Date.now()}`;
      const auditRecord = {
        id: auditId,
        target: url.trim(),
        targetType: "url",
        evidence: [],
        evidenceResult: evidence,
        normalizedEvidenceResult: normalizedResult,
        aceScore: scoreResult,
        aceReport: report,
        summaryReport: summary,
        status: "completed" as const,
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
      };
      addToHistory(auditRecord);
      setCurrentAudit(auditRecord);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error during analysis";
      setError(msg);
      setStatus("error");
    }
  }, [url, addToHistory, setCurrentAudit]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("analyzing");
    setError(null);
    setResult(null);
    setNormalized(null);
    setAceScore(null);
    setAceReport(null);
    setSummaryReport(null);

    try {
      const evidence = await extractEvidenceFromFile(file);
      const normalizedResult = normalizeEvidence(evidence);
      const scoreResult = scoreNormalizedEvidence(normalizedResult);
      const report = generateAceReport(scoreResult, normalizedResult);
      const summary = generateSummaryReport(scoreResult);
      setResult(evidence);
      setNormalized(normalizedResult);
      setAceScore(scoreResult);
      setAceReport(report);
      setSummaryReport(summary);
      setStatus("completed");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to process file";
      setError(msg);
      setStatus("error");
    }
  }, []);

  const summary = result ? getEvidenceSummary(result) : null;
  const isContaminated = result?.contamination ?? false;
  const contaminationFlags = result?.contaminationFlags ?? [];

  return (
    <PageLayout
      title="Page Analyzer"
      subtitle="Audit a single webpage for AI comprehension readiness"
    >
      {/* Input section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* URL input */}
        <Panel
          title="URL Input"
          subtitle="Enter a webpage URL to audit"
          action={<Globe className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                type="url"
                placeholder="https://example.com/page"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && runAnalysis()}
                className="font-mono text-sm"
                disabled={status === "analyzing"}
              />
              <Button
                className="shrink-0 gap-1.5"
                onClick={runAnalysis}
                disabled={status === "analyzing" || !url.trim()}
              >
                {status === "analyzing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {status === "analyzing" ? "Analyzing..." : "Analyze"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The ACE engine will extract evidence, normalize, score, and generate a report.
            </p>
          </div>
        </Panel>

        {/* File upload */}
        <Panel
          title="File Upload"
          subtitle="Upload an HTML or text file for analysis"
          action={<Upload className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-8 text-center">
            <Upload className="mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm font-medium text-muted-foreground">Drop HTML file here</p>
            <p className="mt-1 text-xs text-muted-foreground/70">or click to browse</p>
            <label className="mt-3 cursor-pointer">
              <input
                type="file"
                accept=".html,.htm,.txt,.md,.json"
                onChange={handleFileUpload}
                className="hidden"
                disabled={status === "analyzing"}
              />
              <span className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                Browse Files
              </span>
            </label>
          </div>
        </Panel>
      </div>

      {/* Error state */}
      {status === "error" && error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Analysis Failed</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {status === "completed" && result && summary && (
        <div className="space-y-4">
          <SectionHeader
            title="Results"
            subtitle={`Evidence extracted from ${result.url}`}
            action={
              isContaminated ? (
                <div className="flex items-center gap-1.5 rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                  <span className="text-xs font-medium text-warning">
                    Contaminated: {contaminationFlags.join(", ")}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success/10 px-2.5 py-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span className="text-xs font-medium text-success">Clean extraction</span>
                </div>
              )
            }
          />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="score">ACE Score</TabsTrigger>
              <TabsTrigger value="evidence">Evidence Preview</TabsTrigger>
              <TabsTrigger value="normalized">Normalized</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
            </TabsList>

            {/* Overview tab */}
            <TabsContent value="overview" className="space-y-4">
              {/* Evidence summary cards */}
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label="Headings" value={summary.headings} />
                <MetricCard label="Paragraphs" value={summary.paragraphs} />
                <MetricCard label="Links" value={summary.links} />
                <MetricCard label="Structured Data" value={summary.structuredData} />
                <MetricCard label="Entities" value={summary.entities} />
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                <MetricCard label="Lists" value={summary.lists} />
                <MetricCard label="Tables" value={summary.tables} />
                <MetricCard label="Semantic Signals" value={summary.semantic} />
                <MetricCard label="Accessibility" value={summary.accessibility} />
                <MetricCard
                  label="Absence Signals"
                  value={summary.absence}
                  accent={summary.absence > 5 ? "warning" : "default"}
                />
              </div>

              {/* Page metadata */}
              {result.metadata && Object.keys(result.metadata).length > 0 && (
                <Panel title="Page Metadata" subtitle="Extracted from head and meta tags">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {result.metadata.title && (
                      <MetadataItem label="Title" value={result.metadata.title} />
                    )}
                    {result.metadata.description && (
                      <MetadataItem label="Description" value={result.metadata.description} />
                    )}
                    {result.metadata.canonical && (
                      <MetadataItem label="Canonical" value={result.metadata.canonical} mono />
                    )}
                    {result.metadata.language && (
                      <MetadataItem label="Language" value={result.metadata.language} />
                    )}
                    {result.metadata.ogTitle && (
                      <MetadataItem label="OG Title" value={result.metadata.ogTitle} />
                    )}
                    {result.metadata.ogType && (
                      <MetadataItem label="OG Type" value={result.metadata.ogType} />
                    )}
                    {result.metadata.twitterCard && (
                      <MetadataItem label="Twitter Card" value={result.metadata.twitterCard} />
                    )}
                    {result.metadata.author && (
                      <MetadataItem label="Author" value={result.metadata.author} />
                    )}
                  </div>
                </Panel>
              )}

              {/* Domain profile */}
              {result.domainProfile.length > 0 && result.domainProfile[0]?.metadata?.primaryType && (
                <Panel title="Domain Profile" subtitle="Detected page type">
                  <div className="flex items-center gap-3">
                    <span className="rounded-md bg-accent/20 px-3 py-1.5 text-sm font-medium text-accent">
                      {result.domainProfile[0].metadata.primaryType as string}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Confidence: {((result.domainProfile[0].confidence ?? 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </Panel>
              )}
            </TabsContent>

            {/* ACE Score tab */}
            <TabsContent value="score" className="space-y-4">
              {aceScore ? (
                <AceScoreDisplay score={aceScore} />
              ) : (
                <Panel title="ACE Score" subtitle="Machine Comprehension Rating">
                  <EmptyState
                    icon={<Calculator className="h-8 w-8" />}
                    title="No score available"
                    description="The ACE score will appear here after analysis completes."
                  />
                </Panel>
              )}
            </TabsContent>

            {/* Evidence tab */}
            <TabsContent value="evidence" className="space-y-4">
              <EvidenceSectionDisplay result={result} />
            </TabsContent>

            {/* Normalized tab */}
            <TabsContent value="normalized" className="space-y-4">
              {normalized ? (
                <NormalizedEvidenceDisplay normalized={normalized} />
              ) : (
                <Panel title="Normalized Evidence" subtitle="Deduplicated and canonicalized evidence">
                  <EmptyState
                    icon={<FileJson className="h-8 w-8" />}
                    title="No normalized evidence"
                    description="Normalized evidence will appear here after analysis completes."
                  />
                </Panel>
              )}
            </TabsContent>

            {/* Diagnostics tab */}
            <TabsContent value="diagnostics" className="space-y-4">
              <DiagnosticsPanel result={result} />
            </TabsContent>

            {/* Report tab */}
            <TabsContent value="report" className="space-y-4">
              {aceReport && summaryReport ? (
                <ReportDisplay report={aceReport} summary={summaryReport} />
              ) : (
                <Panel
                  title="Generated Report"
                  subtitle="Audit report output"
                  action={
                    <Button variant="outline" size="sm" className="gap-1.5" disabled>
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </Button>
                  }
                >
                  <EmptyState
                    icon={<FileText className="h-8 w-8" />}
                    title="No report generated"
                    description="Reports will be available after analysis completes."
                  />
                </Panel>
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Idle state */}
      {status === "idle" && (
        <div className="space-y-4">
          <SectionHeader title="Results" subtitle="Audit results will appear here after analysis" />
          <Tabs defaultValue="overview" className="w-full">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="evidence">Evidence Preview</TabsTrigger>
              <TabsTrigger value="diagnostics">Diagnostics</TabsTrigger>
              <TabsTrigger value="report">Report</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <MetricCard label="ML Readiness" value="—" />
                <MetricCard label="Semantic Access." value="—" />
                <MetricCard label="Structured Understanding" value="—" />
                <MetricCard label="Extractability" value="—" />
                <MetricCard label="AI Interpretability" value="—" />
              </div>
              <Panel title="Overall ACE Score" subtitle="Composite score across all dimensions">
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No results yet"
                  description="Run an analysis to see the overall ACE score and breakdown."
                />
              </Panel>
            </TabsContent>
            <TabsContent value="evidence">
              <Panel title="Evidence Preview" subtitle="Raw evidence extracted from the target page">
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No evidence collected"
                  description="Evidence extraction will populate here after analysis."
                />
              </Panel>
            </TabsContent>
            <TabsContent value="diagnostics">
              <Panel title="Diagnostics" subtitle="Fetch and DOM parse diagnostics">
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No diagnostics available"
                  description="Diagnostics will appear here after analysis."
                />
              </Panel>
            </TabsContent>
            <TabsContent value="report">
              <Panel title="Generated Report" subtitle="Audit report output">
                <EmptyState
                  icon={<FileText className="h-8 w-8" />}
                  title="No report generated"
                  description="Reports will be available after analysis completes."
                />
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PageLayout>
  );
}

/** Metadata key-value display item. */
function MetadataItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-border p-2.5">
      <p className="ace-section-label">{label}</p>
      <p className={`mt-1 text-sm text-foreground ${mono ? "font-mono text-xs" : ""} truncate`}>{value}</p>
    </div>
  );
}

/** Evidence section display with collapsible signal lists. */
function EvidenceSectionDisplay({ result }: { result: AceEvidenceResult }) {
  const sections: { label: string; sections: typeof result.headings; icon: string }[] = [
    { label: "Headings", sections: result.headings, icon: "H" },
    { label: "Paragraphs", sections: result.paragraphs, icon: "P" },
    { label: "Lists", sections: result.lists, icon: "≡" },
    { label: "Tables", sections: result.tables, icon: "▦" },
    { label: "Links", sections: result.links, icon: "↗" },
    { label: "Accessibility", sections: result.accessibility, icon: "♿" },
    { label: "Structured Data", sections: result.structuredData, icon: "{}" },
    { label: "Semantic HTML", sections: result.semantic, icon: "§" },
    { label: "Semantic Structure", sections: result.semanticStructure, icon: "⌘" },
    { label: "Structured Content", sections: result.structuredContent, icon: "☰" },
    { label: "Extractability", sections: result.extractability, icon: "⤓" },
    { label: "Redundancy", sections: result.redundancy, icon: "⟲" },
    { label: "Entities", sections: result.entities, icon: "◎" },
    { label: "Anchor Text", sections: result.anchorText, icon: "⚓" },
    { label: "Absence", sections: result.absence, icon: "∅" },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {sections.map(({ label, sections: secs, icon }) => {
        const totalSignals = secs.reduce((s, sec) => s + sec.count, 0);
        const hasData = totalSignals > 0;

        return (
          <div key={label} className="ace-card p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-mono text-muted-foreground">
                  {icon}
                </span>
                <span className="text-sm font-medium">{label}</span>
              </div>
              <span className={`font-mono text-xs ${hasData ? "text-accent" : "text-muted-foreground"}`}>
                {totalSignals}
              </span>
            </div>
            {hasData && (
              <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto ace-scroll">
                {secs.flatMap((sec) => sec.signals.slice(0, 5)).map((signal, i) => (
                  <div key={i} className="rounded border border-border/50 px-2 py-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted-foreground">{signal.type}</span>
                      <span className="font-mono text-[10px] text-muted-foreground/60">
                        {(signal.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-foreground truncate">{signal.value}</p>
                  </div>
                ))}
                {totalSignals > 5 && (
                  <p className="text-[10px] text-muted-foreground px-2">
                    +{totalSignals - 5} more signals...
                  </p>
                )}
              </div>
            )}
            {!hasData && (
              <p className="mt-2 text-xs text-muted-foreground/50">No signals detected</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Diagnostics panel showing fetch and DOM parse info. */
function DiagnosticsPanel({ result }: { result: AceEvidenceResult }) {
  const diag = result.diagnostics;
  if (!diag) return null;

  const checks: { label: string; passed: boolean; value?: string }[] = [
    { label: "Fetch Status", passed: !diag.fetchError, value: diag.fetchStatus ? `${diag.fetchStatus}` : "N/A" },
    { label: "Fetch Error", passed: !diag.fetchError, value: diag.fetchError },
    { label: "HTML Size", passed: !diag.oversizedHtml, value: `${(diag.htmlSize ?? 0).toLocaleString()} bytes` },
    { label: "Parse Errors", passed: !diag.parseErrors?.length, value: diag.parseErrors?.join("; ") },
    { label: "Hydration Shell", passed: !diag.hydrationShell },
    { label: "Shadow DOM", passed: !diag.shadowDom },
    { label: "Script-Only DOM", passed: !diag.scriptOnlyDom },
    { label: "Boilerplate-Only", passed: !diag.boilerplateOnly },
    { label: "Oversized HTML", passed: !diag.oversizedHtml },
    { label: "Encoding Failure", passed: !diag.encodingFailure },
    { label: "Malformed DOM", passed: !diag.malformedDom },
    { label: "Main Content Found", passed: diag.mainContentFound },
    { label: "Visible Text", passed: diag.visibleTextLength > 50, value: `${diag.visibleTextLength} chars` },
  ];

  return (
    <Panel title="Extraction Diagnostics" subtitle="Fetch and DOM parse diagnostics">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <div
            key={check.label}
            className={`flex items-center justify-between rounded-md border p-2.5 ${
              check.passed ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
            }`}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">{check.label}</p>
              {check.value && (
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">{check.value}</p>
              )}
            </div>
            {check.passed ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            )}
          </div>
        ))}
      </div>

      {/* Contamination flags */}
      {result.contaminationFlags && result.contaminationFlags.length > 0 && (
        <div className="mt-4">
          <p className="ace-section-label mb-2">Contamination Flags</p>
          <div className="flex flex-wrap gap-2">
            {result.contaminationFlags.map((flag) => (
              <span
                key={flag}
                className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-xs text-warning"
              >
                {flag}
              </span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

/** Normalized evidence display showing deduplicated, canonicalized sections. */
function NormalizedEvidenceDisplay({ normalized }: { normalized: NormalizedEvidenceResult }) {
  const normSummary = getNormalizedSummary(normalized);

  const sections: { label: string; sections: NormalizedSection[]; icon: string }[] = [
    { label: "Normalized Headings", sections: normalized.headings, icon: "H" },
    { label: "Normalized Paragraphs", sections: normalized.paragraphs, icon: "P" },
    { label: "Normalized Lists", sections: normalized.lists, icon: "≡" },
    { label: "Normalized Tables", sections: normalized.tables, icon: "▦" },
    { label: "Normalized Links", sections: normalized.links, icon: "↗" },
    { label: "Semantic", sections: normalized.semantic, icon: "§" },
    { label: "Semantic Structure", sections: normalized.semanticStructure, icon: "⌘" },
    { label: "Structured Content", sections: normalized.structuredContent, icon: "☰" },
    { label: "Domain Profile", sections: normalized.domainProfile, icon: "◉" },
    { label: "Entities", sections: normalized.entities, icon: "◎" },
    { label: "Accessibility", sections: normalized.accessibility, icon: "♿" },
    { label: "Structured Data", sections: normalized.structuredData, icon: "{}" },
    { label: "Extractability", sections: normalized.extractability, icon: "⤓" },
    { label: "Redundancy", sections: normalized.redundancy, icon: "⟲" },
    { label: "Absence", sections: normalized.absence, icon: "∅" },
  ];

  return (
    <div className="space-y-4">
      {/* Normalization summary cards */}
      <Panel title="Normalization Summary" subtitle="Deduplicated and canonicalized evidence counts">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {Object.entries(normSummary).map(([key, count]) => (
            <div key={key} className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">{key}</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">{count}</p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Normalized text preview — full text, scrollable */}
      {normalized.normalizedText && (
        <Panel title="Normalized Text" subtitle={`Canonical text extracted from all evidence sections (${normalized.normalizedText.length.toLocaleString()} chars)`}>
          <div className="max-h-96 overflow-y-auto ace-scroll rounded-md bg-muted/30 p-3">
            <p className="font-mono text-xs text-foreground whitespace-pre-wrap break-words">
              {normalized.normalizedText}
            </p>
          </div>
        </Panel>
      )}

      {/* Token stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="Sentences" value={normalized.normalizedSentences.length} />
        <MetricCard label="Words" value={normalized.normalizedWords.length} />
        <MetricCard label="Paragraph Tokens" value={normalized.normalizedParagraphTokens.length} />
      </div>

      {/* Normalization warnings/errors */}
      {(normalized.normalizationWarnings.length > 0 || normalized.normalizationErrors.length > 0) && (
        <Panel title="Normalization Diagnostics" subtitle="Warnings and errors from the normalization process">
          <div className="space-y-2">
            {normalized.normalizationErrors.map((err, i) => (
              <div key={`err-${i}`} className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive mt-0.5" />
                <p className="text-xs text-foreground font-mono">{err}</p>
              </div>
            ))}
            {normalized.normalizationWarnings.map((warn, i) => (
              <div key={`warn-${i}`} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground font-mono">{warn}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Normalized sections grid */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {sections.map(({ label, sections: secs, icon }) => {
          const totalSignals = secs.reduce((s, sec) => s + sec.normalizedSignals.length, 0);
          const totalDeduped = secs.reduce((s, sec) => s + (sec.duplicatesRemoved ?? 0), 0);
          const hasData = totalSignals > 0;

          return (
            <div key={label} className="ace-card p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-mono text-muted-foreground">
                    {icon}
                  </span>
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {totalDeduped > 0 && (
                    <span className="font-mono text-[10px] text-muted-foreground/60">
                      -{totalDeduped} dupes
                    </span>
                  )}
                  <span className={`font-mono text-xs ${hasData ? "text-accent" : "text-muted-foreground"}`}>
                    {totalSignals}
                  </span>
                </div>
              </div>
              {hasData && (
                <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto ace-scroll">
                  {secs.flatMap((sec) => sec.normalizedSignals.slice(0, 4)).map((signal, i) => (
                    <div key={i} className="rounded border border-border/50 px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-muted-foreground">{signal.type}</span>
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {(signal.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-foreground truncate">{signal.value}</p>
                    </div>
                  ))}
                  {totalSignals > 4 && (
                    <p className="text-[10px] text-muted-foreground px-2">
                      +{totalSignals - 4} more signals...
                    </p>
                  )}
                </div>
              )}
              {!hasData && (
                <p className="mt-2 text-xs text-muted-foreground/50">No normalized signals</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ACE Score display with MCR, metric breakdown, and recommendations. */
function AceScoreDisplay({ score }: { score: ACEScore }) {
  const grade = getGrade(score.finalScore);
  const summary = getAceScoreSummary(score);
  const metricEntries = Object.entries(score.metrics) as [string, MetricScore][];
  const allRecommendations = metricEntries
    .flatMap(([key, metric]) => metric.recommendations.map((r) => ({ ...r, metric: key })))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  const statusLabel = score.status === "scored"
    ? "Scored"
    : score.status === "scored_absence_evidence"
    ? "Scored (Absence Dominant)"
    : "Insufficient Evidence";

  const statusColor = score.status === "scored"
    ? "text-success"
    : score.status === "scored_absence_evidence"
    ? "text-warning"
    : "text-destructive";

  return (
    <div className="space-y-4">
      {/* MCR Hero Score */}
      <div className="ace-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ace-section-label">Machine Comprehension Rating (MCR)</p>
            <div className="mt-2 flex items-baseline gap-3">
              {score.finalScore !== null ? (
                <>
                  <span className="font-mono text-5xl font-bold text-foreground">
                    {score.finalScore.toFixed(1)}
                  </span>
                  <span className="text-2xl text-muted-foreground">/ 100</span>
                  <span className={`ml-2 rounded-md px-2.5 py-1 text-lg font-bold ${
                    grade === "A" ? "bg-success/20 text-success" :
                    grade === "B" ? "bg-accent/20 text-accent" :
                    grade === "C" ? "bg-warning/20 text-warning" :
                    "bg-destructive/20 text-destructive"
                  }`}>
                    {grade}
                  </span>
                </>
              ) : (
                <span className="font-mono text-4xl font-bold text-muted-foreground">N/A</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className={`text-sm font-medium ${statusColor}`}>{statusLabel}</span>
              {score.confidence !== null && (
                <span className="text-xs text-muted-foreground">
                  Confidence: {(score.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <Award className="h-12 w-12 text-muted-foreground/30" />
        </div>
      </div>

      {/* Metric Breakdown Grid */}
      <div>
        <p className="ace-section-label mb-2">Metric Breakdown</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {metricEntries.map(([key, metric]) => {
            const weight = (DEFAULT_WEIGHTS as unknown as Record<string, number>)[key] ?? 0;
            const metricGrade = getGrade(metric.score);
            return (
              <div key={key} className="ace-card p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground">
                    {key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    w={(weight * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline gap-2">
                  {metric.score !== null ? (
                    <>
                      <span className={`font-mono text-xl font-bold ${
                        metric.score >= 70 ? "text-success" :
                        metric.score >= 50 ? "text-warning" :
                        "text-destructive"
                      }`}>
                        {metric.score.toFixed(0)}
                      </span>
                      <span className="text-xs text-muted-foreground">{metricGrade}</span>
                    </>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">N/A</span>
                  )}
                  {metric.confidence !== null && (
                    <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                      conf {(metric.confidence * 100).toFixed(0)}%
                    </span>
                  )}
                </div>
                {metric.weaknesses.length > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground truncate">
                    {metric.weaknesses[0]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Scoring Diagnostics */}
      {score.diagnostics.scoringWarnings.length > 0 && (
        <Panel title="Scoring Diagnostics" subtitle="Warnings from the scoring pipeline">
          <div className="space-y-1.5">
            {score.diagnostics.scoringWarnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground font-mono">{warn}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Missing Evidence */}
      {score.diagnostics.missingEvidence.length > 0 && (
        <Panel title="Missing Evidence" subtitle="Metrics that could not be scored due to insufficient evidence">
          <div className="space-y-1.5">
            {score.diagnostics.missingEvidence.map((miss, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-border/50 p-2">
                <span className="font-mono text-xs text-muted-foreground">{miss}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Absence Evidence Impact */}
      {score.diagnostics.absenceEvidence.length > 0 && (
        <Panel title="Absence Evidence Impact" subtitle="Missing elements that affected scoring">
          <div className="space-y-1.5">
            {score.diagnostics.absenceEvidence.map((absence, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground font-mono">{absence}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Recommendations */}
      {allRecommendations.length > 0 && (
        <Panel title="Recommendations" subtitle={`${allRecommendations.length} actionable recommendations to improve ACE score`}>
          <div className="space-y-2">
            {allRecommendations.slice(0, 12).map((rec, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-border/50 p-2.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  rec.priority === "high" ? "bg-destructive/15 text-destructive" :
                  rec.priority === "medium" ? "bg-warning/15 text-warning" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {rec.priority}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-foreground">{rec.message}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
                    {rec.metric} · {rec.category}
                  </p>
                </div>
              </div>
            ))}
            {allRecommendations.length > 12 && (
              <p className="text-xs text-muted-foreground/60">
                +{allRecommendations.length - 12} more recommendations...
              </p>
            )}
          </div>
        </Panel>
      )}

      {/* Version Metadata */}
      <div className="flex items-center gap-3 rounded-md bg-muted/20 p-3">
        <TrendingUp className="h-4 w-4 text-muted-foreground" />
        <div className="flex flex-wrap gap-3 font-mono text-[10px] text-muted-foreground">
          <span>scoring v{score.version.scoring}</span>
          <span>metrics v{score.version.metrics}</span>
          <span>weighting v{score.version.weighting}</span>
          <span>normalization v{score.version.normalization}</span>
        </div>
      </div>
    </div>
  );
}

/** Full report display with summary, metric reports, recommendations, and version metadata. */
function ReportDisplay({ report, summary }: { report: AceReport; summary: AceSummaryReport }) {
  const metricEntries = Object.entries(report.metrics);
  const grade = getGrade(report.finalScore);
  const statusLabel = report.status === "scored"
    ? "Scored"
    : report.status === "scored_absence_evidence"
    ? "Scored (Absence Dominant)"
    : "Insufficient Evidence";

  return (
    <div className="space-y-4">
      {/* Summary hero */}
      <div className="ace-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="ace-section-label">ACE Report — Summary</p>
            <div className="mt-2 flex items-baseline gap-3">
              {report.finalScore !== null ? (
                <>
                  <span className="font-mono text-4xl font-bold text-foreground">
                    {report.finalScore.toFixed(1)}
                  </span>
                  <span className="text-xl text-muted-foreground">/ 100</span>
                  <span className={`ml-2 rounded-md px-2 py-1 text-base font-bold ${
                    grade === "A" ? "bg-success/20 text-success" :
                    grade === "B" ? "bg-accent/20 text-accent" :
                    grade === "C" ? "bg-warning/20 text-warning" :
                    "bg-destructive/20 text-destructive"
                  }`}>
                    {grade}
                  </span>
                </>
              ) : (
                <span className="font-mono text-3xl font-bold text-muted-foreground">N/A</span>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">{statusLabel}</span>
              {report.confidence !== null && (
                <span className="text-xs text-muted-foreground">
                  Confidence: {(report.confidence * 100).toFixed(0)}%
                </span>
              )}
            </div>
          </div>
          <FileText className="h-10 w-10 text-muted-foreground/30" />
        </div>
      </div>

      {/* Top Recommendations */}
      {report.topRecommendations.length > 0 && (
        <Panel title="Top Recommendations" subtitle={`${report.topRecommendations.length} prioritized recommendations from the scoring engine`}>
          <div className="space-y-2">
            {report.topRecommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-border/50 p-2.5">
                <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                  rec.priority === "high" ? "bg-destructive/15 text-destructive" :
                  rec.priority === "medium" ? "bg-warning/15 text-warning" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {rec.priority}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-foreground">{rec.message}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-muted-foreground/60">
                    {rec.category}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Absence Evidence */}
      {report.absenceEvidence.length > 0 && (
        <Panel title="Absence Evidence" subtitle="Missing elements that affected scoring">
          <div className="space-y-1.5">
            {report.absenceEvidence.map((absence, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground font-mono">{absence}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Contamination Summary */}
      {report.contamination && (
        <Panel title="Contamination Summary" subtitle="Detected contamination and its impact">
          <div className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-3">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning">{report.contaminationType ?? "Unknown contamination"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Contamination affected evidence extraction and scoring confidence.
              </p>
            </div>
          </div>
        </Panel>
      )}

      {/* Metric Reports */}
      <Panel title="Metric Reports" subtitle="Per-metric breakdown with formulas and components">
        <div className="space-y-2">
          {metricEntries.map(([key, metric]) => (
            <div key={key} className="ace-card p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{metric.displayName}</span>
                <div className="flex items-center gap-2">
                  {metric.score !== null ? (
                    <span className={`font-mono text-lg font-bold ${
                      metric.score >= 70 ? "text-success" :
                      metric.score >= 50 ? "text-warning" :
                      "text-destructive"
                    }`}>
                      {metric.score.toFixed(1)}
                    </span>
                  ) : (
                    <span className="font-mono text-sm text-muted-foreground">null</span>
                  )}
                  <span className={`font-mono text-[10px] ${
                    metric.status === "scored" ? "text-success" : "text-destructive"
                  }`}>
                    {metric.status === "scored" ? "scored" : "insufficient"}
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded bg-black/20 p-2">
                <p className="font-mono text-[10px] text-muted-foreground/80">{metric.formula}</p>
              </div>
              {Object.keys(metric.components).length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {Object.entries(metric.components).map(([ck, cv]) => (
                    <div key={ck} className="rounded border border-border/30 px-1.5 py-0.5">
                      <span className="font-mono text-[9px] text-muted-foreground/60">{ck}</span>
                      <span className="ml-1 font-mono text-[10px] text-foreground">{cv.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}
              {metric.weaknesses.length > 0 && (
                <div className="mt-2">
                  <p className="ace-section-label text-[9px] mb-1">Weaknesses</p>
                  <div className="space-y-0.5">
                    {metric.weaknesses.map((w, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-warning mt-0.5" />
                        <p className="text-[10px] text-muted-foreground">{w}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {metric.recommendations.length > 0 && (
                <div className="mt-2">
                  <p className="ace-section-label text-[9px] mb-1">Recommendations</p>
                  <div className="space-y-0.5">
                    {metric.recommendations.map((r, i) => (
                      <div key={i} className="flex items-start gap-1">
                        <span className={`shrink-0 rounded px-1 font-mono text-[8px] font-medium ${
                          r.priority === "high" ? "bg-destructive/15 text-destructive" :
                          r.priority === "medium" ? "bg-warning/15 text-warning" :
                          "bg-muted text-muted-foreground"
                        }`}>
                          {r.priority}
                        </span>
                        <p className="text-[10px] text-foreground">{r.message}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Panel>

      {/* Weighting Profile */}
      <Panel title="Weighting Profile" subtitle="Weights used for final score computation">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {Object.entries(report.weightingProfile).map(([key, weight]) => (
            <div key={key} className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">{key}</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                {(weight * 100).toFixed(0)}%
              </p>
            </div>
          ))}
        </div>
      </Panel>

      {/* Summary Report Section */}
      <Panel title="Summary Report" subtitle="Lightweight report with top 5 recommendations and weaknesses">
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">Final Score</p>
              <p className="mt-1 font-mono text-xl font-bold text-foreground">
                {summary.finalScore !== null ? summary.finalScore.toFixed(1) : "N/A"}
              </p>
            </div>
            <div className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">Confidence</p>
              <p className="mt-1 font-mono text-xl font-bold text-foreground">
                {summary.confidence !== null ? `${(summary.confidence * 100).toFixed(0)}%` : "N/A"}
              </p>
            </div>
            <div className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">Status</p>
              <p className="mt-1 text-xs font-medium text-foreground">{summary.status}</p>
            </div>
          </div>

          {summary.weaknesses.length > 0 && (
            <div>
              <p className="ace-section-label mb-2">Weaknesses ({summary.weaknesses.length})</p>
              <div className="space-y-1 max-h-40 overflow-y-auto ace-scroll">
                {summary.weaknesses.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-border/50 px-2 py-1">
                    <AlertTriangle className="h-2.5 w-2.5 shrink-0 text-warning mt-0.5" />
                    <p className="text-[10px] text-muted-foreground">{w}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary.topRecommendations.length > 0 && (
            <div>
              <p className="ace-section-label mb-2">Top 5 Recommendations</p>
              <div className="space-y-1.5">
                {summary.topRecommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-md border border-border/50 p-2">
                    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium ${
                      rec.priority === "high" ? "bg-destructive/15 text-destructive" :
                      rec.priority === "medium" ? "bg-warning/15 text-warning" :
                      "bg-muted text-muted-foreground"
                    }`}>
                      {rec.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-foreground">{rec.message}</p>
                      <p className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">{rec.category}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Panel>

      {/* Export Button */}
      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ace-report-${report.url.replace(/[^a-z0-9]/gi, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export Full Report (JSON)
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => {
            const blob = new Blob([JSON.stringify(summary, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `ace-summary-${summary.url.replace(/[^a-z0-9]/gi, "-")}.json`;
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          <Download className="h-3.5 w-3.5" />
          Export Summary (JSON)
        </Button>
      </div>

      {/* Version Metadata */}
      <div className="flex flex-wrap gap-3 rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
        <span>reporting v{report.version.reporting}</span>
        <span>schema v{report.version.schema}</span>
        <span>scoring v{report.version.scoring}</span>
        <span>metrics v{report.version.metrics}</span>
        <span>weighting v{report.version.weighting}</span>
        <span>normalization v{report.version.normalization}</span>
        <span>evidence v{report.version.evidence}</span>
      </div>
    </div>
  );
}
