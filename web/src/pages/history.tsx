/**
 * History Page — Past audit records with table and filtering.
 * Phase 1: UI scaffolding only — no data fetching logic.
 */
import { History as HistoryIcon, Trash2, Search } from "lucide-react";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useHistory } from "@/context";

interface HistoryRow {
  target: string;
  type: string;
  score: string;
  grade: string;
  status: string;
  date: string;
}

const columns: Column<HistoryRow>[] = [
  { key: "target", header: "Target" },
  { key: "type", header: "Type" },
  { key: "score", header: "ACE Score" },
  { key: "grade", header: "Grade" },
  { key: "status", header: "Status" },
  { key: "date", header: "Date" },
];

export default function HistoryPage() {
  const { history, clearHistory } = useHistory();

  return (
    <PageLayout
      title="Audit History"
      subtitle="Browse and manage past audit records"
      action={
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={clearHistory}
          disabled={history.length === 0}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Clear History
        </Button>
      }
    >
      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Filter by URL, status, or grade..."
            className="pl-9"
          />
        </div>
        <select className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
          <option>All statuses</option>
          <option>Completed</option>
          <option>Running</option>
          <option>Failed</option>
        </select>
      </div>

      {/* History table */}
      {history.length === 0 ? (
        <Card className="ace-card">
          <EmptyState
            icon={<HistoryIcon className="h-10 w-10" />}
            title="No audit history"
            description="Completed audits will be listed here. Run your first analysis from the Page Analyzer."
          />
        </Card>
      ) : (
        <DataTable columns={columns} data={[]} emptyMessage="No audit records found" />
      )}
    </PageLayout>
  );
}
