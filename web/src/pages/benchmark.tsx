/**
 * Benchmark Page — Phase 6
 * Corpus-driven benchmark runner with CSV upload, snapshot support,
 * regression comparison, drift detection, and performance metrics.
 */
import { useState, useCallback, useRef } from "react";
import {
  Upload, Play, Gauge, Loader2, AlertTriangle, CheckCircle2,
  FileText, Download, GitBranch, TrendingUp, Activity, Clock,
} from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Panel } from "@/components/ui/Panel";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useBenchmark } from "@/context";
import {
  CsvCorpusProvider,
  generateSyntheticCorpusCsv,
  parseCsv,
  validateCsv,
} from "@/modules/benchmarking/corpus/csvCorpusProvider";
import {
  runMultiSiteBenchmark,
  sortResults,
} from "@/modules/benchmarking/multiSiteBenchmarkRunner";
import {
  createBaseline,
  serializeBaseline,
  deserializeBaseline,
  isBaselineCompatible,
  isBaselineCorrupted,
  BENCHMARK_VERSION,
} from "@/modules/benchmarking/baselineManager";
import { compareRegression } from "@/modules/benchmarking/regressionComparator";
import { detectDrift } from "@/modules/benchmarking/driftDetector";
import {
  buildBenchmarkSummaryReport,
  buildRegressionReport,
  buildDriftReport,
} from "@/modules/benchmarking/benchmarkReportBuilder";
import { computeCorpusHash } from "@/modules/benchmarking/corpusUtils";
import type {
  BenchmarkCorpus,
  BenchmarkResult,
  MultiSiteBenchmarkResult,
  BenchmarkBaseline,
  RegressionComparisonResult,
  BenchmarkSummaryReport,
  RegressionReport,
  DriftReport,
} from "@/types";
import type { CsvValidationResult } from "@/modules/benchmarking/corpus/csvCorpusProvider";

type BenchStatus = "idle" | "loading" | "running" | "completed" | "error";

export default function BenchmarkPage() {
  const { runs, addRun } = useBenchmark();
  const [status, setStatus] = useState<BenchStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("0 / 0");
  const [corpus, setCorpus] = useState<BenchmarkCorpus | null>(null);
  const [corpusValidation, setCorpusValidation] = useState<CsvValidationResult | null>(null);
  const [benchResult, setBenchResult] = useState<MultiSiteBenchmarkResult | null>(null);
  const [baseline, setBaseline] = useState<BenchmarkBaseline | null>(null);
  const [regressionComparison, setRegressionComparison] = useState<RegressionComparisonResult | null>(null);
  const [summaryReport, setSummaryReport] = useState<BenchmarkSummaryReport | null>(null);
  const [regressionReport, setRegressionReport] = useState<RegressionReport | null>(null);
  const [driftReport, setDriftReport] = useState<DriftReport | null>(null);
  const [label, setLabel] = useState("");
  const [concurrency, setConcurrency] = useState("3");
  const [mode, setMode] = useState<"regression" | "live">("regression");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("loading");
    setError(null);

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const validation = validateCsv(rows);

      setCorpusValidation(validation);

      if (!validation.valid) {
        setError(`CSV validation failed: ${validation.errors.join("; ")}`);
        setStatus("error");
        return;
      }

      const provider = new CsvCorpusProvider(text);
      const loadedCorpus = await provider.load();
      setCorpus(loadedCorpus);
      setStatus("idle");

      if (validation.warnings.length > 0) {
        console.debug(`[benchmark] CSV warnings: ${validation.warnings.join("; ")}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load CSV file";
      setError(msg);
      setStatus("error");
    }
  }, []);

  const loadSyntheticCorpus = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const csv = generateSyntheticCorpusCsv();
      const rows = parseCsv(csv);
      const validation = validateCsv(rows);
      setCorpusValidation(validation);

      const provider = new CsvCorpusProvider(csv);
      const loadedCorpus = await provider.load();
      setCorpus(loadedCorpus);
      setStatus("idle");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to generate synthetic corpus";
      setError(msg);
      setStatus("error");
    }
  }, []);

  const runBenchmark = useCallback(async () => {
    if (!corpus) {
      setError("No corpus loaded");
      return;
    }

    setStatus("running");
    setError(null);
    setProgress(0);
    setProgressLabel(`0 / ${corpus.totalCount}`);
    setBenchResult(null);
    setRegressionComparison(null);
    setSummaryReport(null);
    setRegressionReport(null);
    setDriftReport(null);

    try {
      const result = await runMultiSiteBenchmark(
        corpus,
        mode,
        parseInt(concurrency) || 1,
        (completed, total, caseId) => {
          setProgress(Math.round((completed / total) * 100));
          setProgressLabel(`${completed} / ${total} — ${caseId}`);
        },
      );

      setBenchResult(result);

      // Build summary report
      const summary = buildBenchmarkSummaryReport(corpus, result.results, result.summary, mode);
      setSummaryReport(summary);

      // Check for existing baseline and run regression comparison
      const baselineKey = `ace-baseline-${computeCorpusHash(corpus)}`;
      const storedBaselineJson = localStorage.getItem(baselineKey);
      if (storedBaselineJson) {
        const storedBaseline = deserializeBaseline(storedBaselineJson);
        if (storedBaseline && isBaselineCompatible(storedBaseline, corpus)) {
          setBaseline(storedBaseline);
          const comparison = compareRegression(result.results, storedBaseline);
          setRegressionComparison(comparison);

          const regReport = buildRegressionReport(corpus, comparison, storedBaseline.benchmarkVersion);
          setRegressionReport(regReport);

          const dReport = buildDriftReport(comparison);
          setDriftReport(dReport);
        }
      } else {
        // Create new baseline from this run
        const newBaseline = createBaseline(corpus, result.results);
        setBaseline(newBaseline);
        try {
          localStorage.setItem(baselineKey, serializeBaseline(newBaseline));
        } catch {
          // Storage may be full
        }
      }

      setStatus("completed");

      // Add to benchmark history
      addRun({
        id: `bench-${Date.now()}`,
        label: label || `Benchmark ${new Date().toISOString().split("T")[0]}`,
        source: "csv-upload",
        urls: corpus.cases.map((c) => c.url).filter(Boolean) as string[],
        totalUrls: corpus.totalCount,
        completedUrls: result.summary.passed + result.summary.failed,
        status: "completed",
        progress: 100,
        aggregateScore: summary.averageScore ?? undefined,
        results: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Benchmark execution failed";
      setError(msg);
      setStatus("error");
    }
  }, [corpus, mode, concurrency, label, addRun]);

  const corpusHash = corpus ? computeCorpusHash(corpus) : null;

  return (
    <PageLayout
      title="Benchmark Runner"
      subtitle="Corpus-driven benchmarking with regression comparison and drift detection"
    >
      {/* Input section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* CSV Upload */}
        <Panel
          title="Upload Benchmark CSV"
          subtitle="CSV with page_id, category, url columns"
          action={<Upload className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-3">
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border py-8 text-center">
              <Upload className="mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">Drop CSV file here</p>
              <p className="mt-1 text-xs text-muted-foreground/70">page_id, category, url, expected_type, tags, notes</p>
              <label className="mt-3 cursor-pointer">
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={status === "running" || status === "loading"}
                />
                <span className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
                  Browse Files
                </span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={loadSyntheticCorpus}
                disabled={status === "running" || status === "loading"}
              >
                <FileText className="h-3.5 w-3.5" />
                Load Synthetic Corpus (8×200)
              </Button>
            </div>
          </div>
        </Panel>

        {/* Run Configuration */}
        <Panel
          title="Run Configuration"
          subtitle="Configure and launch the benchmark"
          action={<Gauge className="h-4 w-4 text-muted-foreground" />}
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Production sites — July 2026"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={status === "running"}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Mode</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "regression" | "live")}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={status === "running"}
              >
                <option value="regression">Regression (snapshot-based)</option>
                <option value="live">Live (URL-based)</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Concurrency</label>
              <select
                value={concurrency}
                onChange={(e) => setConcurrency(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                disabled={status === "running"}
              >
                <option value="1">1 (sequential)</option>
                <option value="3">3 (default)</option>
                <option value="5">5</option>
                <option value="10">10 (aggressive)</option>
              </select>
            </div>
            <Button
              className="w-full gap-1.5"
              onClick={runBenchmark}
              disabled={status === "running" || !corpus}
            >
              {status === "running" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {status === "running" ? "Running..." : "Start Benchmark"}
            </Button>
          </div>
        </Panel>
      </div>

      {/* Error state */}
      {status === "error" && error && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-destructive">Benchmark Error</p>
            <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          </div>
        </div>
      )}

      {/* CSV Validation Results */}
      {corpusValidation && (
        <Panel title="Corpus Validation" subtitle="CSV schema validation results">
          <div className="space-y-3">
            <div className={`flex items-center gap-2 rounded-md p-3 ${corpusValidation.valid ? "bg-success/10" : "bg-destructive/10"}`}>
              {corpusValidation.valid ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-destructive" />
              )}
              <div>
                <p className={`text-sm font-medium ${corpusValidation.valid ? "text-success" : "text-destructive"}`}>
                  {corpusValidation.valid ? "Validation Passed" : "Validation Failed"}
                </p>
                <p className="text-xs text-muted-foreground">{corpusValidation.rowCount} data rows</p>
              </div>
            </div>

            {corpusValidation.errors.length > 0 && (
              <div>
                <p className="ace-section-label mb-1">Errors ({corpusValidation.errors.length})</p>
                <div className="space-y-1">
                  {corpusValidation.errors.map((err, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-destructive/20 bg-destructive/5 px-2 py-1">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-destructive mt-0.5" />
                      <p className="text-xs text-muted-foreground font-mono">{err}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {corpusValidation.warnings.length > 0 && (
              <div>
                <p className="ace-section-label mb-1">Warnings ({corpusValidation.warnings.length})</p>
                <div className="space-y-1">
                  {corpusValidation.warnings.map((warn, i) => (
                    <div key={i} className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-2 py-1">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-warning mt-0.5" />
                      <p className="text-xs text-muted-foreground font-mono">{warn}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Progress */}
      {(status === "running" || status === "completed") && corpus && (
        <Panel title="Run Progress" subtitle="Active benchmark execution">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">
                {status === "running" ? "Running benchmark..." : "Benchmark complete"}
              </span>
              <span className="font-mono text-sm text-muted-foreground">{progressLabel}</span>
            </div>
            <Progress value={progress} className="h-1.5" />
            {corpusHash && (
              <div className="flex items-center gap-2">
                <span className="ace-section-label text-[10px]">Corpus Hash:</span>
                <span className="font-mono text-[10px] text-muted-foreground">{corpusHash}</span>
              </div>
            )}
          </div>
        </Panel>
      )}

      {/* Results */}
      {status === "completed" && benchResult && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Sites" value={benchResult.summary.totalSites} />
            <MetricCard
              label="Passed"
              value={benchResult.summary.passed}
              accent={benchResult.summary.passed > 0 ? "success" : "default"}
            />
            <MetricCard
              label="Failed"
              value={benchResult.summary.failed}
              accent={benchResult.summary.failed > 0 ? "destructive" : "default"}
            />
            <MetricCard
              label="Avg Score"
              value={summaryReport?.averageScore !== null && summaryReport?.averageScore !== undefined
                ? summaryReport.averageScore.toFixed(1)
                : "—"
              }
            />
          </div>

          <Tabs defaultValue="summary" className="w-full">
            <TabsList>
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="categories">Categories</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
              <TabsTrigger value="regression">Regression</TabsTrigger>
              <TabsTrigger value="drift">Drift</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
            </TabsList>

            {/* Summary tab */}
            <TabsContent value="summary" className="space-y-4">
              {summaryReport && (
                <Panel title="Benchmark Summary Report" subtitle="Aggregate metrics across all corpus cases">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Mode</p>
                        <p className="mt-1 text-sm font-medium text-foreground">{summaryReport.mode}</p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Total Sites</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">{summaryReport.totalSites}</p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Median Score</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">
                          {summaryReport.medianScore !== null ? summaryReport.medianScore.toFixed(1) : "N/A"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Corpus Hash</p>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground">{summaryReport.corpusHash}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 rounded-md bg-muted/20 p-3 font-mono text-[10px] text-muted-foreground">
                      <span>benchmark v{BENCHMARK_VERSION}</span>
                      <span>evidence v{summaryReport.version.evidence}</span>
                      <span>scoring v{summaryReport.version.scoring}</span>
                      <span>reporting v{summaryReport.version.reporting}</span>
                      <span>schema v{summaryReport.version.schema}</span>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(summaryReport, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `benchmark-summary-${corpusHash}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export Summary
                      </Button>
                    </div>
                  </div>
                </Panel>
              )}
            </TabsContent>

            {/* Categories tab */}
            <TabsContent value="categories" className="space-y-4">
              <Panel title="Category Summary" subtitle="Per-category breakdown of benchmark results">
                <div className="space-y-2">
                  {Object.entries(benchResult.summary.categories).map(([cat, summary]) => (
                    <div key={cat} className="ace-card p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-foreground">{cat}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {summary.passed}/{summary.total} passed
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full bg-success rounded-full"
                          style={{ width: `${summary.total > 0 ? (summary.passed / summary.total) * 100 : 0}%` }}
                        />
                      </div>
                      <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span>Failed: {summary.failed}</span>
                        {summary.driftDetected > 0 && (
                          <span className="text-warning">Drift: {summary.driftDetected}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </TabsContent>

            {/* Performance tab */}
            <TabsContent value="performance" className="space-y-4">
              <Panel title="Performance Metrics" subtitle="Execution time analysis across the corpus">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-md border border-border p-3">
                    <p className="ace-section-label text-[10px]">Average Runtime</p>
                    <p className="mt-1 font-mono text-lg font-bold text-foreground">
                      {benchResult.summary.performance.averageRuntimeMs}ms
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="ace-section-label text-[10px]">Median Runtime</p>
                    <p className="mt-1 font-mono text-lg font-bold text-foreground">
                      {benchResult.summary.performance.medianRuntimeMs}ms
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="ace-section-label text-[10px]">Slowest Page</p>
                    <p className="mt-1 font-mono text-xs text-foreground truncate">
                      {benchResult.summary.performance.slowestPageId}
                    </p>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="ace-section-label text-[10px]">Fastest Page</p>
                    <p className="mt-1 font-mono text-xs text-foreground truncate">
                      {benchResult.summary.performance.fastestPageId}
                    </p>
                  </div>
                </div>
              </Panel>
            </TabsContent>

            {/* Regression tab */}
            <TabsContent value="regression" className="space-y-4">
              {regressionComparison && regressionReport ? (
                <Panel
                  title="Regression Comparison"
                  subtitle="Current results vs stored baseline"
                  action={<GitBranch className="h-4 w-4 text-muted-foreground" />}
                >
                  <div className="space-y-3">
                    <div className={`flex items-center gap-2 rounded-md p-3 ${regressionComparison.corpusDrift ? "bg-warning/10" : "bg-success/10"}`}>
                      {regressionComparison.corpusDrift ? (
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5 text-success" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${regressionComparison.corpusDrift ? "text-warning" : "text-success"}`}>
                          {regressionComparison.corpusDrift ? "Corpus Drift Detected" : "No Corpus Drift"}
                        </p>
                        {regressionComparison.corpusDrift && (
                          <p className="text-xs text-muted-foreground">{regressionComparison.corpusDriftReason}</p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Total Cases</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-foreground">{regressionComparison.totalCases}</p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Cases with Drift</p>
                        <p className={`mt-1 font-mono text-sm font-semibold ${regressionComparison.casesWithDrift > 0 ? "text-warning" : "text-success"}`}>
                          {regressionComparison.casesWithDrift}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Categories with Drift</p>
                        <p className={`mt-1 font-mono text-sm font-semibold ${regressionComparison.categoriesWithDrift.length > 0 ? "text-warning" : "text-success"}`}>
                          {regressionComparison.categoriesWithDrift.length}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Baseline Version</p>
                        <p className="mt-1 font-mono text-xs text-foreground">{regressionReport.baselineVersion}</p>
                      </div>
                    </div>

                    {regressionComparison.categoriesWithDrift.length > 0 && (
                      <div>
                        <p className="ace-section-label mb-2">Categories with Drift</p>
                        <div className="flex flex-wrap gap-2">
                          {regressionComparison.categoriesWithDrift.map((cat) => (
                            <span key={cat} className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 font-mono text-xs text-warning">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => {
                          const blob = new Blob([JSON.stringify(regressionReport, null, 2)], { type: "application/json" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `regression-report-${corpusHash}.json`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export Regression Report
                      </Button>
                    </div>
                  </div>
                </Panel>
              ) : (
                <Panel title="Regression Comparison" subtitle="No baseline available — first run creates the baseline">
                  <EmptyState
                    icon={<GitBranch className="h-8 w-8" />}
                    title="No baseline for comparison"
                    description="The first benchmark run creates a baseline. Subsequent runs will be compared against it for drift detection."
                  />
                </Panel>
              )}
            </TabsContent>

            {/* Drift tab */}
            <TabsContent value="drift" className="space-y-4">
              {driftReport && driftReport.totalDriftRecords > 0 ? (
                <Panel title="Drift Report" subtitle="Detailed drift records between current and baseline">
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Total Drift Records</p>
                        <p className="mt-1 font-mono text-sm font-semibold text-warning">{driftReport.totalDriftRecords}</p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Drift Types</p>
                        <p className="mt-1 font-mono text-xs text-foreground">
                          {Object.keys(driftReport.driftByType).join(", ")}
                        </p>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <p className="ace-section-label text-[10px]">Affected Categories</p>
                        <p className="mt-1 font-mono text-xs text-foreground">
                          {Object.keys(driftReport.driftByCategory).join(", ")}
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="ace-section-label mb-2">Drift Records</p>
                      <div className="space-y-1 max-h-60 overflow-y-auto ace-scroll">
                        {driftReport.records.map((d, i) => (
                          <div key={i} className="flex items-start gap-2 rounded border border-warning/20 bg-warning/5 px-2 py-1.5">
                            <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium ${
                              d.type === "score" ? "bg-warning/20 text-warning" :
                              d.type === "schema" ? "bg-destructive/20 text-destructive" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {d.type}
                            </span>
                            <div className="min-w-0">
                              <p className="font-mono text-[10px] text-muted-foreground">
                                {d.caseId}{d.metric ? ` · ${d.metric}` : ""}
                              </p>
                              <p className="font-mono text-[10px] text-foreground">
                                {d.baselineValue} → {d.currentValue} (Δ{d.delta.toFixed(2)})
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Panel>
              ) : (
                <Panel title="Drift Report" subtitle="No drift detected">
                  <EmptyState
                    icon={<CheckCircle2 className="h-8 w-8" />}
                    title="No drift detected"
                    description="All benchmark results match the stored baseline within tolerance thresholds."
                  />
                </Panel>
              )}
            </TabsContent>

            {/* Results tab */}
            <TabsContent value="results" className="space-y-4">
              <Panel title="Per-Case Results" subtitle={`${benchResult.results.length} benchmark results`}>
                <div className="space-y-1 max-h-96 overflow-y-auto ace-scroll">
                  {benchResult.results.map((r) => (
                    <div key={r.caseId} className="flex items-center gap-3 rounded border border-border/50 px-3 py-2">
                      {r.status === "ok" ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-foreground">{r.caseId}</span>
                          <span className="font-mono text-[10px] text-muted-foreground/60">{r.category}</span>
                        </div>
                        {r.errorMessage && (
                          <p className="text-[10px] text-destructive truncate">{r.errorMessage}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.score?.finalScore !== null && r.score?.finalScore !== undefined && (
                          <span className={`font-mono text-sm font-bold ${
                            r.score.finalScore >= 70 ? "text-success" :
                            r.score.finalScore >= 50 ? "text-warning" :
                            "text-destructive"
                          }`}>
                            {r.score.finalScore.toFixed(1)}
                          </span>
                        )}
                        {r.score?.finalScore === null && (
                          <span className="font-mono text-xs text-muted-foreground">N/A</span>
                        )}
                        <span className="font-mono text-[10px] text-muted-foreground/60">
                          {r.executionTimeMs}ms
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </Panel>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Idle state — no corpus loaded */}
      {status === "idle" && !corpus && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard label="Total Runs" value={runs.length} />
          <MetricCard label="URLs Tested" value="—" />
          <MetricCard label="Avg Score" value="—" />
          <MetricCard label="Pass Rate" value="—" />
        </div>
      )}

      {/* Run history */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Run History</h2>
        {runs.length === 0 ? (
          <Panel title="Benchmark Runs" subtitle="Completed and historical runs">
            <EmptyState
              icon={<Gauge className="h-8 w-8" />}
              title="No benchmark runs yet"
              description="Upload a CSV file or load the synthetic corpus, then start a benchmark run."
            />
          </Panel>
        ) : (
          <Panel title="Benchmark Runs" subtitle={`${runs.length} completed runs`}>
            <div className="space-y-1 max-h-48 overflow-y-auto ace-scroll">
              {runs.map((run) => (
                <div key={run.id} className="flex items-center gap-3 rounded border border-border/50 px-3 py-2">
                  <Activity className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <span className="text-xs font-medium text-foreground">{run.label ?? "Unnamed run"}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground/60">
                      {run.totalUrls ?? 0} URLs
                    </span>
                  </div>
                  {run.aggregateScore !== undefined && typeof run.aggregateScore === "number" && (
                    <span className="font-mono text-xs text-foreground">
                      Avg: {run.aggregateScore.toFixed(1)}
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted-foreground/60">
                    {run.completedAt?.split("T")[0] ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        )}
      </div>
    </PageLayout>
  );
}
