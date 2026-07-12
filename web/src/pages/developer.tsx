/**
 * Developer Mode Page — Engine internals panel with structured sections.
 * Phase 2: Wired to evidence extraction diagnostics from the current audit.
 */
import { useMemo } from "react";
import {
  Code2, FileJson, Calculator, Scale, ScrollText, Workflow,
  AlertTriangle, CheckCircle2, Activity, FileText, Network, Bug,
  Layers, GitBranch, Tag, Boxes,
} from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Panel } from "@/components/ui/Panel";
import { EmptyState } from "@/components/ui/EmptyState";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useHistory } from "@/context";
import { getEvidenceSummary } from "@/modules/evidence";
import { getNormalizedSummary } from "@/modules/normalization";
import {
  scoreNormalizedEvidence,
  getAceScoreSummary,
  getGrade,
  DEFAULT_WEIGHTS,
  METRIC_NAMES,
} from "@/modules/scoring";
import {
  generateDeveloperReport,
  generateSummaryReport,
  REPORTING_VERSION,
  SCHEMA_VERSION,
} from "@/modules/reporting";
import type { AceEvidenceResult, NormalizedEvidenceResult, NormalizedSection, ACEScore, MetricScore, DeveloperReport, AceSummaryReport } from "@/types";

export default function DeveloperPage() {
  const { currentAudit, history } = useHistory();

  // Get the most recent evidence result from the audit record
  const evidenceResult = useMemo<AceEvidenceResult | null>(() => {
    const audit = currentAudit ?? history[0];
    if (!audit) return null;
    return audit.evidenceResult ?? null;
  }, [currentAudit, history]);

  // Get the normalized evidence result from the audit record
  const normalizedResult = useMemo<NormalizedEvidenceResult | null>(() => {
    const audit = currentAudit ?? history[0];
    if (!audit) return null;
    return audit.normalizedEvidenceResult ?? null;
  }, [currentAudit, history]);

  // Compute ACE score from normalized evidence (deterministic, memoized)
  const aceScore = useMemo<ACEScore | null>(() => {
    if (!normalizedResult) return null;
    return scoreNormalizedEvidence(normalizedResult);
  }, [normalizedResult]);

  const scoreSummary = aceScore ? getAceScoreSummary(aceScore) : null;
  const summary = evidenceResult ? getEvidenceSummary(evidenceResult) : null;
  const normSummary = normalizedResult ? getNormalizedSummary(normalizedResult) : null;
  const diag = evidenceResult?.diagnostics;

  // Generate developer and summary reports (deterministic, memoized)
  const developerReport = useMemo<DeveloperReport | null>(() => {
    if (!aceScore || !normalizedResult || !evidenceResult) return null;
    return generateDeveloperReport(aceScore, normalizedResult, evidenceResult);
  }, [aceScore, normalizedResult, evidenceResult]);

  const summaryReport = useMemo<AceSummaryReport | null>(() => {
    if (!aceScore) return null;
    return generateSummaryReport(aceScore);
  }, [aceScore]);

  return (
    <PageLayout
      title="Developer Mode"
      subtitle="Inspect raw engine internals: evidence, normalization, scoring, and rules"
    >
      <Tabs defaultValue="raw-evidence" className="w-full">
        <TabsList className="flex-wrap">
          <TabsTrigger value="raw-evidence" className="gap-1.5">
            <Code2 className="h-3.5 w-3.5" />
            Raw Evidence
          </TabsTrigger>
          <TabsTrigger value="fetch-diag" className="gap-1.5">
            <Network className="h-3.5 w-3.5" />
            Fetch Diagnostics
          </TabsTrigger>
          <TabsTrigger value="dom-diag" className="gap-1.5">
            <Bug className="h-3.5 w-3.5" />
            DOM Diagnostics
          </TabsTrigger>
          <TabsTrigger value="contamination" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" />
            Contamination
          </TabsTrigger>
          <TabsTrigger value="absence" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Absence Evidence
          </TabsTrigger>
          <TabsTrigger value="metadata" className="gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            Metadata
          </TabsTrigger>
          <TabsTrigger value="normalized" className="gap-1.5">
            <FileJson className="h-3.5 w-3.5" />
            Normalized Evidence
          </TabsTrigger>
          <TabsTrigger value="scoring" className="gap-1.5">
            <Calculator className="h-3.5 w-3.5" />
            Scoring Breakdown
          </TabsTrigger>
          <TabsTrigger value="weighting" className="gap-1.5">
            <Scale className="h-3.5 w-3.5" />
            Weighting Profile
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-1.5">
            <Workflow className="h-3.5 w-3.5" />
            Rule Engine
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-1.5">
            <ScrollText className="h-3.5 w-3.5" />
            Benchmark Logs
          </TabsTrigger>
        </TabsList>

        {/* Raw Evidence */}
        <TabsContent value="raw-evidence">
          <Panel
            title="Raw Evidence"
            subtitle="Unprocessed evidence objects extracted from the target"
            action={<Code2 className="h-4 w-4 text-muted-foreground" />}
          >
            {evidenceResult && summary ? (
              <div className="space-y-4">
                {/* Evidence summary table */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
                  {Object.entries(summary).map(([key, count]) => (
                    <div key={key} className="rounded-md border border-border p-2.5">
                      <p className="ace-section-label text-[10px]">{key}</p>
                      <p className="mt-1 font-mono text-lg font-semibold text-foreground">{count}</p>
                    </div>
                  ))}
                </div>

                {/* Hierarchy preview */}
                {evidenceResult.hierarchy && (
                  <div>
                    <p className="ace-section-label mb-2">Document Hierarchy</p>
                    <HierarchyDisplay node={evidenceResult.hierarchy} depth={0} />
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<Code2 className="h-8 w-8" />}
                title="No raw evidence available"
                description="Run an audit from the Page Analyzer to see extracted evidence objects with selectors, values, and confidence scores."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Fetch Diagnostics */}
        <TabsContent value="fetch-diag">
          <Panel
            title="Fetch Diagnostics"
            subtitle="HTTP fetch status, errors, and response metadata"
            action={<Network className="h-4 w-4 text-muted-foreground" />}
          >
            {diag ? (
              <div className="space-y-2">
                <DiagnosticRow label="Fetch Status" value={diag.fetchStatus?.toString() ?? "N/A"} passed={!diag.fetchError} />
                <DiagnosticRow label="Fetch Error" value={diag.fetchError ?? "None"} passed={!diag.fetchError} />
                <DiagnosticRow label="HTML Size" value={`${(diag.htmlSize ?? 0).toLocaleString()} bytes`} passed={!diag.oversizedHtml} />
                <DiagnosticRow label="Content Type" value={(evidenceResult?.metadata?.contentType as string) ?? "N/A"} passed={true} />
                <DiagnosticRow label="Source URL" value={evidenceResult?.url ?? "N/A"} passed={true} mono />
              </div>
            ) : (
              <EmptyState
                icon={<Network className="h-8 w-8" />}
                title="No fetch diagnostics"
                description="Fetch diagnostics will appear here after running a URL analysis."
              />
            )}
          </Panel>
        </TabsContent>

        {/* DOM Diagnostics */}
        <TabsContent value="dom-diag">
          <Panel
            title="DOM Parse Diagnostics"
            subtitle="Hydration, shadow DOM, script-only, boilerplate, encoding detection"
            action={<Bug className="h-4 w-4 text-muted-foreground" />}
          >
            {diag ? (
              <div className="space-y-2">
                <DiagnosticRow label="Hydration Shell Detected" value={diag.hydrationShell ? "YES" : "No"} passed={!diag.hydrationShell} />
                <DiagnosticRow label="Shadow DOM Detected" value={diag.shadowDom ? "YES" : "No"} passed={!diag.shadowDom} />
                <DiagnosticRow label="Script-Only DOM" value={diag.scriptOnlyDom ? "YES" : "No"} passed={!diag.scriptOnlyDom} />
                <DiagnosticRow label="Boilerplate-Only Page" value={diag.boilerplateOnly ? "YES" : "No"} passed={!diag.boilerplateOnly} />
                <DiagnosticRow label="Oversized HTML" value={diag.oversizedHtml ? "YES" : "No"} passed={!diag.oversizedHtml} />
                <DiagnosticRow label="Encoding Failure" value={diag.encodingFailure ? "YES" : "No"} passed={!diag.encodingFailure} />
                <DiagnosticRow label="Malformed DOM" value={diag.malformedDom ? "YES" : "No"} passed={!diag.malformedDom} />
                <DiagnosticRow label="Parse Errors" value={diag.parseErrors?.join("; ") ?? "None"} passed={!diag.parseErrors?.length} />
                <DiagnosticRow label="Main Content Found" value={diag.mainContentFound ? "Yes" : "NO"} passed={diag.mainContentFound} />
                <DiagnosticRow label="Visible Text Length" value={`${diag.visibleTextLength} chars`} passed={diag.visibleTextLength > 50} />
              </div>
            ) : (
              <EmptyState
                icon={<Bug className="h-8 w-8" />}
                title="No DOM diagnostics"
                description="DOM parse diagnostics will appear here after running an analysis."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Contamination Flags */}
        <TabsContent value="contamination">
          <Panel
            title="Contamination Diagnostics"
            subtitle="Contamination flags, DOM corruption, fetch failures, and scoring impact"
            action={<AlertTriangle className="h-4 w-4 text-muted-foreground" />}
          >
            {evidenceResult ? (
              <div className="space-y-3">
                {/* Primary contamination status */}
                <div className={`flex items-center gap-2 rounded-md p-3 ${evidenceResult.contamination ? "bg-warning/10" : "bg-success/10"}`}>
                  {evidenceResult.contamination ? (
                    <>
                      <AlertTriangle className="h-5 w-5 text-warning" />
                      <div>
                        <p className="text-sm font-medium text-warning">Contamination Detected</p>
                        <p className="text-xs text-muted-foreground">Primary type: {evidenceResult.contaminationType}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-success" />
                      <div>
                        <p className="text-sm font-medium text-success">No Contamination</p>
                        <p className="text-xs text-muted-foreground">Evidence extraction was clean.</p>
                      </div>
                    </>
                  )}
                </div>

                {/* Scoring skip warning */}
                {aceScore && aceScore.status === "insufficient_evidence" && aceScore.diagnostics.contamination && (
                  <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-destructive">Scoring Was Blocked</p>
                      <p className="text-xs text-muted-foreground">
                        Metric calculators were skipped due to contamination. finalScore=null, confidence=null.
                      </p>
                    </div>
                  </div>
                )}

                {/* All contamination flags */}
                {evidenceResult.contaminationFlags && evidenceResult.contaminationFlags.length > 0 && (
                  <div>
                    <p className="ace-section-label mb-2">All Contamination Flags</p>
                    <div className="flex flex-wrap gap-2">
                      {evidenceResult.contaminationFlags.map((flag) => (
                        <span
                          key={flag}
                          className="rounded-md border border-warning/30 bg-warning/10 px-2.5 py-1 font-mono text-xs text-warning"
                        >
                          {flag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Contamination diagnostics summary from collector */}
                {evidenceResult.diagnostics?.contaminationDiagnostics && (
                  <div className="space-y-2">
                    <p className="ace-section-label mb-1">Contamination Diagnostics Summary</p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Has Blocking Contamination</p>
                        <p className={`mt-1 text-sm font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.hasBlockingContamination ? "text-destructive" : "text-success"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.hasBlockingContamination ? "Yes — scoring blocked" : "No"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Primary Type</p>
                        <p className="mt-1 text-sm font-medium font-mono text-foreground">
                          {evidenceResult.diagnostics.contaminationDiagnostics.primaryType ?? "none"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Fetch Failure</p>
                        <p className={`mt-1 text-sm font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.fetchFailureReason ? "text-destructive" : "text-success"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.fetchFailureReason ? "Yes" : "No"}
                        </p>
                        {evidenceResult.diagnostics.contaminationDiagnostics.fetchFailureReason && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{evidenceResult.diagnostics.contaminationDiagnostics.fetchFailureReason}</p>
                        )}
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">DOM Corruption</p>
                        <p className={`mt-1 text-sm font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.domCorruptionReason ? "text-destructive" : "text-success"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.domCorruptionReason ? "Yes" : "No"}
                        </p>
                        {evidenceResult.diagnostics.contaminationDiagnostics.domCorruptionReason && (
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{evidenceResult.diagnostics.contaminationDiagnostics.domCorruptionReason}</p>
                        )}
                      </div>
                    </div>

                    {/* Detection flags grid */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className={`rounded-md border p-2 ${evidenceResult.diagnostics.contaminationDiagnostics.hydrationShellDetected ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                        <p className="ace-section-label text-[9px]">Hydration Shell</p>
                        <p className={`mt-0.5 text-xs font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.hydrationShellDetected ? "text-warning" : "text-muted-foreground"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.hydrationShellDetected ? "Detected" : "None"}
                        </p>
                      </div>
                      <div className={`rounded-md border p-2 ${evidenceResult.diagnostics.contaminationDiagnostics.scriptOnlyDomDetected ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                        <p className="ace-section-label text-[9px]">Script-Only DOM</p>
                        <p className={`mt-0.5 text-xs font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.scriptOnlyDomDetected ? "text-warning" : "text-muted-foreground"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.scriptOnlyDomDetected ? "Detected" : "None"}
                        </p>
                      </div>
                      <div className={`rounded-md border p-2 ${evidenceResult.diagnostics.contaminationDiagnostics.shadowDomDetected ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                        <p className="ace-section-label text-[9px]">Shadow DOM</p>
                        <p className={`mt-0.5 text-xs font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.shadowDomDetected ? "text-warning" : "text-muted-foreground"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.shadowDomDetected ? "Detected" : "None"}
                        </p>
                      </div>
                      <div className={`rounded-md border p-2 ${evidenceResult.diagnostics.contaminationDiagnostics.boilerplateDetected ? "border-warning/30 bg-warning/5" : "border-border"}`}>
                        <p className="ace-section-label text-[9px]">Boilerplate</p>
                        <p className={`mt-0.5 text-xs font-medium ${evidenceResult.diagnostics.contaminationDiagnostics.boilerplateDetected ? "text-warning" : "text-muted-foreground"}`}>
                          {evidenceResult.diagnostics.contaminationDiagnostics.boilerplateDetected ? "Detected" : "None"}
                        </p>
                      </div>
                    </div>

                    {/* Parser errors */}
                    {evidenceResult.diagnostics.contaminationDiagnostics.parserErrors.length > 0 && (
                      <div>
                        <p className="ace-section-label mb-1">Parser Errors</p>
                        <div className="space-y-0.5">
                          {evidenceResult.diagnostics.contaminationDiagnostics.parserErrors.map((err, i) => (
                            <p key={i} className="font-mono text-[10px] text-muted-foreground">{err}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Encoding failure */}
                    {evidenceResult.diagnostics.contaminationDiagnostics.encodingFailureDetected && (
                      <div className="flex items-center gap-2 rounded-md border border-warning/20 bg-warning/5 p-2">
                        <AlertTriangle className="h-3.5 w-3.5 text-warning" />
                        <p className="text-xs text-warning">Encoding failure detected — some text may be garbled</p>
                      </div>
                    )}

                    {/* Full diagnostic records */}
                    {evidenceResult.diagnostics.contaminationDiagnostics.records.length > 0 && (
                      <div>
                        <p className="ace-section-label mb-1">Diagnostic Records</p>
                        <div className="space-y-1">
                          {evidenceResult.diagnostics.contaminationDiagnostics.records.map((rec, i) => (
                            <div key={i} className="rounded border border-border/50 px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded ${
                                  rec.severity === "critical" ? "bg-destructive/10 text-destructive" :
                                  rec.severity === "warning" ? "bg-warning/10 text-warning" :
                                  "bg-muted text-muted-foreground"
                                }`}>
                                  {rec.severity}
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground">{rec.source}</span>
                                <span className="font-mono text-[10px] text-foreground">{rec.type}</span>
                                {rec.blocksScoring && (
                                  <span className="font-mono text-[9px] text-destructive">blocks scoring</span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{rec.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Contamination evidence section signals */}
                {evidenceResult.absence
                  .flatMap((sec) => sec.signals)
                  .filter((sig) => sig.type === "contamination")
                  .length > 0 && (
                  <div>
                    <p className="ace-section-label mb-2">Contamination Signals</p>
                    <div className="space-y-1.5">
                      {evidenceResult.absence
                        .flatMap((sec) => sec.signals)
                        .filter((sig) => sig.type === "contamination")
                        .map((sig, i) => (
                          <div key={i} className="rounded border border-border/50 px-2 py-1.5">
                            <p className="text-xs text-foreground">{sig.value}</p>
                            {sig.metadata?.description && (
                              <p className="mt-0.5 text-[10px] text-muted-foreground">{sig.metadata.description as string}</p>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Normalization contamination propagation */}
                {normalizedResult && normalizedResult.contamination && (
                  <div className="rounded-md border border-warning/20 bg-warning/5 p-3">
                    <p className="text-sm font-medium text-warning">Contamination Propagated to Normalization</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Type: <span className="font-mono">{normalizedResult.contaminationType ?? "unknown"}</span>
                    </p>
                    {normalizedResult.normalizationWarnings.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {normalizedResult.normalizationWarnings.filter(w => w.includes("contamination") || w.includes("Critical")).map((w, i) => (
                          <p key={i} className="font-mono text-[10px] text-muted-foreground">{w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <EmptyState
                icon={<AlertTriangle className="h-8 w-8" />}
                title="No contamination data"
                description="Contamination flags will appear here after running an analysis."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Absence Evidence */}
        <TabsContent value="absence">
          <Panel
            title="Absence Evidence"
            subtitle="Critical elements missing from the target page"
            action={<FileText className="h-4 w-4 text-muted-foreground" />}
          >
            {evidenceResult && evidenceResult.absence.length > 0 ? (
              <div className="space-y-2">
                {evidenceResult.absence.flatMap((sec) => sec.signals).map((sig, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 rounded-md border p-2.5 ${
                      sig.metadata?.severity === "critical"
                        ? "border-destructive/20 bg-destructive/5"
                        : sig.metadata?.severity === "warning"
                        ? "border-warning/20 bg-warning/5"
                        : "border-border"
                    }`}
                  >
                    <AlertTriangle className={`h-3.5 w-3.5 shrink-0 ${
                      sig.metadata?.severity === "critical" ? "text-destructive" : "text-warning"
                    }`} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground">{sig.value}</p>
                      {sig.metadata?.label && (
                        <p className="text-[10px] text-muted-foreground">{sig.metadata.label as string}</p>
                      )}
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                      {sig.metadata?.severity as string ?? "info"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title="No absence evidence"
                description="Absence evidence will appear here after running an analysis, showing missing critical elements."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Metadata */}
        <TabsContent value="metadata">
          <Panel
            title="Extracted Metadata"
            subtitle="Page metadata from head and meta tags"
            action={<Activity className="h-4 w-4 text-muted-foreground" />}
          >
            {evidenceResult && evidenceResult.metadata ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(evidenceResult.metadata).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([key, value]) => (
                  <div key={key} className="rounded-md border border-border p-2.5">
                    <p className="ace-section-label text-[10px]">{key}</p>
                    <p className="mt-1 font-mono text-xs text-foreground break-all">
                      {String(value).substring(0, 200)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Activity className="h-8 w-8" />}
                title="No metadata extracted"
                description="Page metadata will appear here after running an analysis."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Normalized Evidence */}
        <TabsContent value="normalized">
          <Panel
            title="Normalized Evidence"
            subtitle="Deduplicated, canonicalized, and standardized evidence from the normalization layer"
            action={<FileJson className="h-4 w-4 text-muted-foreground" />}
          >
            {normalizedResult && normSummary ? (
              <NormalizedEvidenceContent
                normalized={normalizedResult}
                summary={normSummary}
              />
            ) : (
              <EmptyState
                icon={<FileJson className="h-8 w-8" />}
                title="No normalized evidence"
                description="Normalized evidence will appear here after running an analysis. The normalization layer processes raw evidence into a canonical, deduplicated form."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Scoring Breakdown */}
        <TabsContent value="scoring">
          <Panel
            title="Scoring Breakdown"
            subtitle="Per-metric ACE v1.2 score computation with formula breakdown"
            action={<Calculator className="h-4 w-4 text-muted-foreground" />}
          >
            {aceScore && scoreSummary ? (
              <ScoringBreakdownContent score={aceScore} />
            ) : (
              <EmptyState
                icon={<Calculator className="h-8 w-8" />}
                title="No scoring data"
                description="Scoring breakdown will appear here after running an analysis. The ACE v1.2 scoring engine computes 12 metrics with deterministic formulas."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Weighting Profile */}
        <TabsContent value="weighting">
          <Panel
            title="Weighting Profile"
            subtitle="ACE v1.2 default weighting profile with metric weights"
            action={<Scale className="h-4 w-4 text-muted-foreground" />}
          >
            <WeightingProfileContent score={aceScore} />
          </Panel>
        </TabsContent>

        {/* Rule Engine Output */}
        <TabsContent value="rules">
          <Panel
            title="Rule Engine Output"
            subtitle="Metric weaknesses, recommendations, and absence evidence mappings"
            action={<Workflow className="h-4 w-4 text-muted-foreground" />}
          >
            {aceScore ? (
              <RuleEngineContent score={aceScore} />
            ) : (
              <EmptyState
                icon={<Workflow className="h-8 w-8" />}
                title="No rule engine data"
                description="Rule evaluations and recommendations will appear here after running an analysis."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Reports */}
        <TabsContent value="reports">
          <Panel
            title="ACE Reports"
            subtitle="Developer report, summary report, and version metadata from the Phase 5 reporting engine"
            action={<FileText className="h-4 w-4 text-muted-foreground" />}
          >
            {developerReport && summaryReport ? (
              <ReportsContent developer={developerReport} summary={summaryReport} />
            ) : (
              <EmptyState
                icon={<FileText className="h-8 w-8" />}
                title="No reports available"
                description="Reports will appear here after running an analysis. The reporting engine generates full, developer, and summary reports from the scoring output."
              />
            )}
          </Panel>
        </TabsContent>

        {/* Benchmark Logs */}
        <TabsContent value="logs">
          <Panel
            title="Benchmark System"
            subtitle="Corpus-driven benchmarking & regression system (Phase 6)"
            action={<ScrollText className="h-4 w-4 text-muted-foreground" />}
          >
            <BenchmarkLogsContent />
          </Panel>
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}

/** Diagnostic row with pass/fail indicator. */
function DiagnosticRow({ label, value, passed, mono }: { label: string; value: string; passed: boolean; mono?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between rounded-md border p-2.5 ${
        passed ? "border-success/20 bg-success/5" : "border-destructive/20 bg-destructive/5"
      }`}
    >
      <span className="text-xs font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`text-xs text-muted-foreground ${mono ? "font-mono" : ""} max-w-md truncate`}>{value}</span>
        {passed ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
        ) : (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
        )}
      </div>
    </div>
  );
}

/** Recursive hierarchy tree display. */
function HierarchyDisplay({ node, depth }: { node: { tag: string; text: string; selector: string; children: typeof node[] }; depth: number }) {
  const maxDepth = 5;
  if (depth > maxDepth) return null;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border/30 pl-2" : ""}>
      <div className="flex items-center gap-1.5 py-0.5">
        <span className="font-mono text-xs text-accent">{node.tag}</span>
        {node.text && (
          <span className="text-xs text-muted-foreground truncate">{node.text.substring(0, 80)}</span>
        )}
      </div>
      {node.children.map((child, i) => (
        <HierarchyDisplay key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/** Normalized evidence content with detailed section display. */
function NormalizedEvidenceContent({
  normalized,
  summary,
}: {
  normalized: NormalizedEvidenceResult;
  summary: Record<string, number>;
}) {
  const sections: { label: string; sections: NormalizedSection[]; icon: string }[] = [
    { label: "Normalized Headings", sections: normalized.headings, icon: "H" },
    { label: "Normalized Paragraphs", sections: normalized.paragraphs, icon: "P" },
    { label: "Normalized Lists", sections: normalized.lists, icon: "≡" },
    { label: "Normalized Tables", sections: normalized.tables, icon: "▦" },
    { label: "Normalized Links", sections: normalized.links, icon: "↗" },
    { label: "Semantic Signals", sections: normalized.semantic, icon: "§" },
    { label: "Semantic Structure", sections: normalized.semanticStructure, icon: "⌘" },
    { label: "Structured Content", sections: normalized.structuredContent, icon: "☰" },
    { label: "Domain Profile", sections: normalized.domainProfile, icon: "◉" },
    { label: "Normalized Entities", sections: normalized.entities, icon: "◎" },
    { label: "Normalized Accessibility", sections: normalized.accessibility, icon: "♿" },
    { label: "Normalized Structured Data", sections: normalized.structuredData, icon: "{}" },
    { label: "Normalized Extractability", sections: normalized.extractability, icon: "⤓" },
    { label: "Normalized Redundancy", sections: normalized.redundancy, icon: "⟲" },
    { label: "Normalized Absence", sections: normalized.absence, icon: "∅" },
  ];

  return (
    <div className="space-y-4">
      {/* Normalization summary */}
      <div>
        <p className="ace-section-label mb-2">Normalization Summary</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {Object.entries(summary).map(([key, count]) => (
            <div key={key} className="rounded-md border border-border p-2.5">
              <p className="ace-section-label text-[10px]">{key}</p>
              <p className="mt-1 font-mono text-sm font-semibold text-foreground">{count}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Contamination status */}
      <div className={`flex items-center gap-2 rounded-md p-3 ${normalized.contamination ? "bg-warning/10" : "bg-success/10"}`}>
        {normalized.contamination ? (
          <>
            <AlertTriangle className="h-5 w-5 text-warning" />
            <div>
              <p className="text-sm font-medium text-warning">Normalized Evidence is Contaminated</p>
              <p className="text-xs text-muted-foreground">Primary type: {normalized.contaminationType}</p>
            </div>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-success" />
            <div>
              <p className="text-sm font-medium text-success">Clean Normalized Evidence</p>
              <p className="text-xs text-muted-foreground">No contamination propagated from extraction.</p>
            </div>
          </>
        )}
      </div>

      {/* Normalized text preview — full text, scrollable */}
      {normalized.normalizedText && (
        <div>
          <p className="ace-section-label mb-2">Normalized Text ({normalized.normalizedText.length.toLocaleString()} chars)</p>
          <div className="max-h-96 overflow-y-auto ace-scroll rounded-md bg-black/30 p-3">
            <p className="font-mono text-xs text-muted-foreground whitespace-pre-wrap break-words">
              {normalized.normalizedText}
            </p>
          </div>
        </div>
      )}

      {/* Token stats */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Sentences</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{normalized.normalizedSentences.length}</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Words</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{normalized.normalizedWords.length}</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Paragraph Tokens</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{normalized.normalizedParagraphTokens.length}</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">List Tokens</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{normalized.normalizedListTokens.length}</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Table Tokens</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">{normalized.normalizedTableTokens.length}</p>
        </div>
      </div>

      {/* Normalized hierarchy */}
      {normalized.hierarchy && (
        <div>
          <p className="ace-section-label mb-2">Normalized Hierarchy</p>
          <NormalizedHierarchyDisplay node={normalized.hierarchy} depth={0} />
        </div>
      )}

      {/* Normalization warnings/errors */}
      {(normalized.normalizationWarnings.length > 0 || normalized.normalizationErrors.length > 0) && (
        <div>
          <p className="ace-section-label mb-2">Normalization Diagnostics</p>
          <div className="space-y-1.5">
            {normalized.normalizationErrors.map((err, i) => (
              <div key={`err-${i}`} className="flex items-start gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-destructive mt-0.5" />
                <p className="text-xs text-foreground font-mono">{err}</p>
              </div>
            ))}
            {normalized.normalizationWarnings.map((warn, i) => (
              <div key={`warn-${i}`} className="flex items-start gap-2 rounded-md border border-warning/20 bg-warning/5 p-2">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="text-xs text-muted-foreground font-mono">{warn}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Normalized sections detail */}
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
                    <span className="font-mono text-[10px] text-muted-foreground/60">-{totalDeduped} dupes</span>
                  )}
                  <span className={`font-mono text-xs ${hasData ? "text-accent" : "text-muted-foreground"}`}>
                    {totalSignals}
                  </span>
                </div>
              </div>
              {hasData && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto ace-scroll">
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
                    <p className="text-[10px] text-muted-foreground px-2">+{totalSignals - 4} more...</p>
                  )}
                </div>
              )}
              {!hasData && <p className="mt-2 text-xs text-muted-foreground/50">No normalized signals</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Normalized hierarchy tree display with orphan detection. */
function NormalizedHierarchyDisplay({
  node,
  depth,
}: {
  node: {
    tag: string;
    normalizedText: string;
    selector: string;
    children: typeof node[];
    isOrphan?: boolean;
  };
  depth: number;
}) {
  const maxDepth = 6;
  if (depth > maxDepth) return null;

  return (
    <div className={depth > 0 ? "ml-4 border-l border-border/30 pl-2" : ""}>
      <div className="flex items-center gap-1.5 py-0.5">
        <span className={`font-mono text-xs ${node.isOrphan ? "text-warning" : "text-accent"}`}>
          {node.tag}
        </span>
        {node.normalizedText && (
          <span className="text-xs text-muted-foreground truncate">{node.normalizedText.substring(0, 80)}</span>
        )}
        {node.isOrphan && (
          <span className="text-[9px] text-warning font-mono">orphan</span>
        )}
      </div>
      {node.children.map((child, i) => (
        <NormalizedHierarchyDisplay key={i} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

/** Scoring breakdown content with MCR, metric scores, and formula details. */
function ScoringBreakdownContent({ score }: { score: ACEScore }) {
  const metricEntries = Object.entries(score.metrics) as [string, MetricScore][];
  const grade = getGrade(score.finalScore);
  const isContaminated = score.status === "insufficient_evidence" && score.diagnostics.contamination;

  return (
    <div className="space-y-4">
      {/* Contamination blocking warning */}
      {isContaminated && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-destructive">Scoring Blocked — Contamination Detected</p>
            <p className="text-xs text-muted-foreground">
              All metric calculators were skipped. finalScore=null, confidence=null.
            </p>
            <p className="text-xs text-muted-foreground">
              Contamination type: <span className="font-mono">{score.diagnostics.contaminationType ?? "unknown"}</span>
            </p>
            {score.diagnostics.scoringWarnings.length > 0 && (
              <div className="mt-1 space-y-0.5">
                {score.diagnostics.scoringWarnings.map((w, i) => (
                  <p key={i} className="font-mono text-[10px] text-muted-foreground">{w}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MCR summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border p-3">
          <p className="ace-section-label text-[10px]">MCR (Final Score)</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {score.finalScore !== null ? score.finalScore.toFixed(1) : "N/A"}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="ace-section-label text-[10px]">Grade</p>
          <p className="mt-1 font-mono text-2xl font-bold text-accent">{grade}</p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="ace-section-label text-[10px]">Confidence</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">
            {score.confidence !== null ? `${(score.confidence * 100).toFixed(0)}%` : "N/A"}
          </p>
        </div>
        <div className="rounded-md border border-border p-3">
          <p className="ace-section-label text-[10px]">Status</p>
          <p className={`mt-1 text-sm font-medium ${
            score.status === "scored" ? "text-success" :
            score.status === "scored_absence_evidence" ? "text-warning" :
            "text-destructive"
          }`}>
            {score.status === "scored" ? "Scored" :
             score.status === "scored_absence_evidence" ? "Absence Dominant" :
             "Insufficient"}
          </p>
        </div>
      </div>

      {/* Per-metric detailed breakdown */}
      {metricEntries.length > 0 ? (
      <div className="space-y-2">
        <p className="ace-section-label mb-2">Per-Metric Calculation Breakdown</p>
        {metricEntries.map(([key, metric]) => {
          const weight = (DEFAULT_WEIGHTS as unknown as Record<string, number>)[key] ?? 0;
          const metricGrade = getGrade(metric.score);
          const componentName = METRIC_NAMES[key as keyof typeof METRIC_NAMES] ?? key;
          return (
            <div key={key} className="ace-card p-3">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{componentName}</span>
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    w={(weight * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {metric.score !== null ? (
                    <>
                      <span className={`font-mono text-lg font-bold ${
                        metric.score >= 70 ? "text-success" :
                        metric.score >= 50 ? "text-warning" :
                        "text-destructive"
                      }`}>
                        {metric.score.toFixed(1)}
                      </span>
                      <span className="text-xs text-muted-foreground">{metricGrade}</span>
                    </>
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

              {/* Confidence */}
              {metric.confidence !== null && (
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground/60">conf:</span>
                  <div className="h-1.5 flex-1 max-w-32 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full"
                      style={{ width: `${metric.confidence * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {(metric.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              )}

              {/* Formula */}
              <div className="mt-2 rounded bg-black/20 p-2">
                <p className="font-mono text-[10px] text-muted-foreground/80">
                  {metric.calculation.formula}
                </p>
              </div>

              {/* Components */}
              {Object.keys(metric.calculation.components).length > 0 && (
                <div className="mt-2 grid grid-cols-2 gap-1 sm:grid-cols-4">
                  {Object.entries(metric.calculation.components).map(([ck, cv]) => (
                    <div key={ck} className="rounded border border-border/30 px-1.5 py-0.5">
                      <span className="font-mono text-[9px] text-muted-foreground/60">{ck}</span>
                      <span className="ml-1 font-mono text-[10px] text-foreground">{cv.toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Evidence */}
              {metric.evidence.length > 0 && (
                <div className="mt-2">
                  <p className="ace-section-label text-[9px] mb-1">Evidence</p>
                  <div className="space-y-0.5">
                    {metric.evidence.slice(0, 4).map((ev, i) => (
                      <p key={i} className="font-mono text-[10px] text-muted-foreground truncate">{ev}</p>
                    ))}
                  </div>
                </div>
              )}

              {/* Weaknesses */}
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
            </div>
          );
        })}
      </div>
      ) : (
        <div className="rounded-md border border-border/50 bg-muted/10 p-4 text-center">
          <p className="text-sm text-muted-foreground">No metric breakdowns — scoring was blocked due to contamination.</p>
        </div>
      )}

      {/* Scoring diagnostics */}
      <div className="space-y-2">
        <p className="ace-section-label mb-2">Scoring Diagnostics</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-2.5">
            <p className="ace-section-label text-[10px]">Contamination</p>
            <p className={`mt-1 text-sm font-medium ${score.diagnostics.contamination ? "text-warning" : "text-success"}`}>
              {score.diagnostics.contamination ? `Yes (${score.diagnostics.contaminationType ?? "unknown"})` : "No"}
            </p>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="ace-section-label text-[10px]">Missing Evidence Count</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{score.diagnostics.missingEvidence.length}</p>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="ace-section-label text-[10px]">Absence Evidence Count</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{score.diagnostics.absenceEvidence.length}</p>
          </div>
          <div className="rounded-md border border-border p-2.5">
            <p className="ace-section-label text-[10px]">Scoring Warnings Count</p>
            <p className="mt-1 font-mono text-sm font-semibold text-foreground">{score.diagnostics.scoringWarnings.length}</p>
          </div>
        </div>
      </div>

      {/* Version metadata */}
      <div className="flex flex-wrap gap-3 rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
        <span>scoring v{score.version.scoring}</span>
        <span>metrics v{score.version.metrics}</span>
        <span>weighting v{score.version.weighting}</span>
        <span>normalization v{score.version.normalization}</span>
        <span>evidence v{score.version.evidence}</span>
      </div>
    </div>
  );
}

/** Weighting profile content showing all weights and their contribution. */
function WeightingProfileContent({ score }: { score: ACEScore | null }) {
  const weights = score?.weightingProfile ?? DEFAULT_WEIGHTS;
  const weightEntries = Object.entries(weights) as [string, number][];
  const totalWeight = weightEntries.reduce((sum, [, w]) => sum + w, 0);

  return (
    <div className="space-y-3">
      <div className="rounded-md bg-muted/30 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Active Profile</span>
          <span className="text-xs text-muted-foreground">ACE v1.2 Default</span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">Sum:</span>
          <span className="font-mono text-sm font-semibold text-foreground">{totalWeight.toFixed(2)}</span>
        </div>
      </div>

      {/* Weight bars */}
      <div className="space-y-2">
        {weightEntries.map(([key, weight]) => {
          const metricName = METRIC_NAMES[key as keyof typeof METRIC_NAMES] ?? key;
          const percentage = (weight * 100).toFixed(0);
          const barWidth = weight * 100;
          return (
            <div key={key} className="space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-foreground">{metricName}</span>
                <span className="font-mono text-xs text-muted-foreground">{weight.toFixed(2)}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    barWidth > 15 ? "bg-accent" :
                    barWidth > 8 ? "bg-accent/70" :
                    "bg-accent/40"
                  }`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Null metric handling note */}
      <div className="rounded-md border border-border/50 p-3">
        <p className="text-xs text-muted-foreground">
          Weights are renormalized when metrics have null scores (insufficient evidence).
          Null metrics are excluded from the weighted sum, and remaining weights are
          rescaled to sum to 1.0. Null is never treated as zero.
        </p>
      </div>
    </div>
  );
}

/** Rule engine content showing weaknesses, recommendations, and absence mappings. */
function RuleEngineContent({ score }: { score: ACEScore }) {
  const metricEntries = Object.entries(score.metrics) as [string, MetricScore][];
  const allRecommendations = metricEntries
    .flatMap(([key, metric]) => metric.recommendations.map((r) => ({ ...r, metric: key })))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 } as const;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  return (
    <div className="space-y-4">
      {/* Absence evidence mappings */}
      {score.diagnostics.absenceEvidence.length > 0 && (
        <div>
          <p className="ace-section-label mb-2">Absence Evidence → Metric Mappings</p>
          <div className="space-y-1">
            {score.diagnostics.absenceEvidence.map((absence, i) => (
              <div key={i} className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="font-mono text-[10px] text-muted-foreground">{absence}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Missing evidence */}
      {score.diagnostics.missingEvidence.length > 0 && (
        <div>
          <p className="ace-section-label mb-2">Missing Evidence (Insufficient Metrics)</p>
          <div className="space-y-1">
            {score.diagnostics.missingEvidence.map((miss, i) => (
              <div key={i} className="flex items-start gap-2 rounded border border-destructive/20 bg-destructive/5 px-2 py-1.5">
                <span className="font-mono text-[10px] text-destructive">{miss}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scoring warnings */}
      {score.diagnostics.scoringWarnings.length > 0 && (
        <div>
          <p className="ace-section-label mb-2">Scoring Warnings</p>
          <div className="space-y-1">
            {score.diagnostics.scoringWarnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-2 py-1.5">
                <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                <p className="font-mono text-[10px] text-muted-foreground">{warn}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All recommendations */}
      <div>
        <p className="ace-section-label mb-2">All Recommendations ({allRecommendations.length})</p>
        <div className="space-y-1.5">
          {allRecommendations.map((rec, i) => (
            <div key={i} className="flex items-start gap-2 rounded border border-border/50 p-2">
              <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium ${
                rec.priority === "high" ? "bg-destructive/15 text-destructive" :
                rec.priority === "medium" ? "bg-warning/15 text-warning" :
                "bg-muted text-muted-foreground"
              }`}>
                {rec.priority}
              </span>
              <div className="min-w-0">
                <p className="text-xs text-foreground">{rec.message}</p>
                <p className="mt-0.5 font-mono text-[9px] text-muted-foreground/60">
                  {rec.metric} · {rec.category} · {rec.id}
                </p>
              </div>
            </div>
          ))}
          {allRecommendations.length === 0 && (
            <p className="text-xs text-muted-foreground/50">No recommendations — all metrics scored well.</p>
          )}
        </div>
      </div>

      {/* Normalization warnings passed through */}
      {score.diagnostics.normalizationWarnings.length > 0 && (
        <div>
          <p className="ace-section-label mb-2">Normalization Warnings (Propagated)</p>
          <div className="space-y-1">
            {score.diagnostics.normalizationWarnings.map((warn, i) => (
              <div key={i} className="flex items-start gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1">
                <span className="font-mono text-[10px] text-muted-foreground/70">{warn}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Reports content showing developer report diagnostics and summary report. */
function ReportsContent({ developer, summary }: { developer: DeveloperReport; summary: AceSummaryReport }) {
  return (
    <div className="space-y-4">
      {/* Summary Report */}
      <div>
        <p className="ace-section-label mb-2">Summary Report</p>
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
      </div>

      {/* Top 5 Recommendations */}
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

      {/* Weaknesses Summary */}
      {summary.weaknesses.length > 0 && (
        <div>
          <p className="ace-section-label mb-2">Weaknesses Summary ({summary.weaknesses.length})</p>
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

      {/* Developer Report Diagnostics */}
      <div>
        <p className="ace-section-label mb-2">Developer Report — Pipeline Diagnostics</p>
        <div className="space-y-3">
          {/* Normalization warnings */}
          <div>
            <p className="ace-section-label text-[10px] mb-1">Normalization Warnings ({developer.diagnostics.normalizationWarnings.length})</p>
            {developer.diagnostics.normalizationWarnings.length > 0 ? (
              <div className="space-y-1">
                {developer.diagnostics.normalizationWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1">
                    <span className="font-mono text-[10px] text-muted-foreground/70">{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">No normalization warnings.</p>
            )}
          </div>

          {/* Scoring warnings */}
          <div>
            <p className="ace-section-label text-[10px] mb-1">Scoring Warnings ({developer.diagnostics.scoringWarnings.length})</p>
            {developer.diagnostics.scoringWarnings.length > 0 ? (
              <div className="space-y-1">
                {developer.diagnostics.scoringWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-2 py-1">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                    <p className="font-mono text-[10px] text-muted-foreground">{w}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">No scoring warnings.</p>
            )}
          </div>

          {/* Pipeline warnings */}
          <div>
            <p className="ace-section-label text-[10px] mb-1">Pipeline Warnings ({developer.diagnostics.pipelineWarnings.length})</p>
            {developer.diagnostics.pipelineWarnings.length > 0 ? (
              <div className="space-y-1">
                {developer.diagnostics.pipelineWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2 rounded border border-border/50 bg-muted/20 px-2 py-1">
                    <span className="font-mono text-[10px] text-muted-foreground/70">{w}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground/50">No pipeline warnings.</p>
            )}
          </div>
        </div>
      </div>

      {/* Version Metadata */}
      <div>
        <p className="ace-section-label mb-2">Report Version Metadata</p>
        <div className="flex flex-wrap gap-3 rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
          <span>evidence v{developer.version.evidence}</span>
          <span>normalization v{developer.version.normalization}</span>
          <span>scoring v{developer.version.scoring}</span>
          <span>metrics v{developer.version.metrics}</span>
          <span>weighting v{developer.version.weighting}</span>
          <span className="text-accent">reporting v{developer.version.reporting}</span>
          <span className="text-accent">schema v{developer.version.schema}</span>
        </div>
      </div>
    </div>
  );
}

/** Benchmark logs content showing corpus info, baseline status, and drift detection. */
function BenchmarkLogsContent() {
  return (
    <div className="space-y-4">
      {/* Benchmark engine status */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Engine</p>
          <p className="mt-1 text-sm font-medium text-foreground">Phase 6</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Version</p>
          <p className="mt-1 font-mono text-sm font-semibold text-foreground">1.0.0</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Modes</p>
          <p className="mt-1 text-sm font-medium text-foreground">Regression + Live</p>
        </div>
        <div className="rounded-md border border-border p-2.5">
          <p className="ace-section-label text-[10px]">Corpus Providers</p>
          <p className="mt-1 text-sm font-medium text-foreground">CSV + Snapshot</p>
        </div>
      </div>

      {/* Corpus architecture */}
      <div>
        <p className="ace-section-label mb-2">Corpus Provider Architecture</p>
        <div className="space-y-2">
          <div className="rounded-md border border-border/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">CsvCorpusProvider</span>
              <span className="font-mono text-[10px] text-accent">active</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              CSV-driven corpus with schema validation (page_id, category, url, expected_type, tags, notes).
              Detects duplicate page_ids, invalid URLs, missing headers, and malformed CSV.
            </p>
          </div>
          <div className="rounded-md border border-border/50 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">SnapshotCorpusProvider</span>
              <span className="font-mono text-[10px] text-muted-foreground">available</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Stored HTML snapshots for Regression Mode. Each case has snapshotHtml populated.
              Deterministic ordering by category, then page_id.
            </p>
          </div>
        </div>
      </div>

      {/* Drift detection thresholds */}
      <div>
        <p className="ace-section-label mb-2">Drift Detection Thresholds</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border/50 p-2.5">
            <p className="ace-section-label text-[10px]">Score Drift</p>
            <p className="mt-1 font-mono text-xs text-foreground">{'> 0.5 points'}</p>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <p className="ace-section-label text-[10px]">Confidence Drift</p>
            <p className="mt-1 font-mono text-xs text-foreground">{'> 0.05'}</p>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <p className="ace-section-label text-[10px]">Metric Drift</p>
            <p className="mt-1 font-mono text-xs text-foreground">{'> 0.5 points'}</p>
          </div>
          <div className="rounded-md border border-border/50 p-2.5">
            <p className="ace-section-label text-[10px]">Critical Metrics</p>
            <p className="mt-1 font-mono text-xs text-foreground">semanticStructure, extractability, machineComprehension</p>
          </div>
        </div>
      </div>

      {/* Corpus-level drift rules */}
      <div>
        <p className="ace-section-label mb-2">Corpus-Level Drift Rules</p>
        <div className="space-y-1">
          <div className="flex items-start gap-2 rounded border border-border/50 p-2">
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
            <p className="text-xs text-muted-foreground">{'>= 2 categories with drift'}</p>
          </div>
          <div className="flex items-start gap-2 rounded border border-border/50 p-2">
            <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
            <p className="text-xs text-muted-foreground">{'>= 10% of all cases with drift'}</p>
          </div>
          <div className="flex items-start gap-2 rounded border border-border/50 p-2">
            <AlertTriangle className="h-3 w-3 shrink-0 text-destructive mt-0.5" />
            <p className="text-xs text-muted-foreground">Any schema drift (field names, ordering, types)</p>
          </div>
        </div>
      </div>

      {/* Benchmark logs console */}
      <div>
        <p className="ace-section-label mb-2">Execution Console</p>
        <div className="rounded-md bg-black/30 p-4 font-mono text-xs text-muted-foreground">
          <div className="opacity-50">// Benchmark engine v1.0.0 — Phase 6 ready</div>
          <div className="opacity-30">// [INFO] CsvCorpusProvider: awaiting corpus load...</div>
          <div className="opacity-30">// [INFO] SnapshotCorpusProvider: awaiting snapshots...</div>
          <div className="opacity-30">// [INFO] BaselineManager: no baseline stored</div>
          <div className="opacity-30">// [INFO] DriftDetector: thresholds configured</div>
          <div className="opacity-30">// [INFO] Run benchmark from the Benchmark Runner page</div>
        </div>
      </div>

      {/* Version metadata */}
      <div className="flex flex-wrap gap-3 rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
        <span>benchmark v1.0.0</span>
        <span>ace v1.2.0</span>
        <span>schema v1.0.0</span>
        <span>reporting v1.2.0</span>
      </div>
    </div>
  );
}
