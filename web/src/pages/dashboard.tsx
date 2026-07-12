/**
 * Dashboard Page — Overview with metric cards, charts, recent audits, benchmarks.
 * Phase 1: UI scaffolding only — no real data logic.
 */
import { Link } from "react-router-dom";
import { Plus, FileSearch, Gauge, ArrowRight } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { MetricCard } from "@/components/ui/MetricCard";
import { ChartPlaceholder } from "@/components/ui/ChartPlaceholder";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { useHistory, useBenchmark } from "@/context";

interface DummyRow {
  target: string;
  score: string;
  grade: string;
  status: string;
  date: string;
}

const recentColumns: Column<DummyRow>[] = [
  { key: "target", header: "Target" },
  { key: "score", header: "ACE Score" },
  { key: "grade", header: "Grade" },
  { key: "status", header: "Status" },
  { key: "date", header: "Date" },
];

export default function DashboardPage() {
  const { history } = useHistory();
  const { runs } = useBenchmark();

  return (
    <PageLayout
      title="Dashboard"
      subtitle="Overview of audit activity and benchmark performance"
      action={
        <Link to="/analyze">
          <Button size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Audit
          </Button>
        </Link>
      }
    >
      {/* Metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Audits"
          value={history.length}
          sublabel="All-time audit records"
          trend={{ direction: "neutral", value: "—" }}
        />
        <MetricCard
          label="Avg ACE Score"
          value="—"
          sublabel="Across completed audits"
          accent="default"
        />
        <MetricCard
          label="Benchmark Runs"
          value={runs.length}
          sublabel="Completed benchmark runs"
          trend={{ direction: "neutral", value: "—" }}
        />
        <MetricCard
          label="Avg Benchmark Score"
          value="—"
          sublabel="Aggregate across runs"
          accent="default"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPlaceholder label="ACE Score Trend" height="h-56" />
        <ChartPlaceholder label="Metric Distribution" height="h-56" />
      </div>

      {/* Recent audits + Quick actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionHeader
            title="Recent Audits"
            subtitle="Latest webpage audit results"
            action={
              <Link to="/history">
                <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                  View all
                  <ArrowRight className="h-3 w-3" />
                </Button>
              </Link>
            }
          />
          <div className="mt-3">
            {history.length === 0 ? (
              <Card className="ace-card">
                <EmptyState
                  icon={<FileSearch className="h-10 w-10" />}
                  title="No audits yet"
                  description="Run your first ACE audit to see results here."
                  action={
                    <Link to="/analyze">
                      <Button size="sm" variant="outline">Start Audit</Button>
                    </Link>
                  }
                />
              </Card>
            ) : (
              <DataTable columns={recentColumns} data={[]} emptyMessage="No recent audits" />
            )}
          </div>
        </div>

        {/* Quick actions sidebar */}
        <div className="space-y-4">
          <SectionHeader title="Quick Actions" />
          <Card className="ace-card p-4">
            <div className="space-y-2">
              <Link
                to="/analyze"
                className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <FileSearch className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Analyze Page</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <Link
                to="/benchmark"
                className="flex items-center justify-between rounded-md border border-border p-3 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <Gauge className="h-4 w-4 text-accent" />
                  <span className="text-sm font-medium">Run Benchmark</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            </div>
          </Card>

          {/* Benchmark summary */}
          <SectionHeader title="Benchmark Summary" />
          <Card className="ace-card p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last run</span>
                <span className="text-sm font-medium">—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">URLs tested</span>
                <span className="text-sm font-medium">—</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Aggregate score</span>
                <span className="text-sm font-medium">—</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </PageLayout>
  );
}
