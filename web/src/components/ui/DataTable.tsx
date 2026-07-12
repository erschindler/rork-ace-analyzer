/**
 * DataTable — Enterprise table component with column headers and row styling.
 * Pagination is a placeholder for Phase 2.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: keyof T | string;
  header: string;
  className?: string;
  render?: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = "No data available",
  className,
}: DataTableProps<T>) {
  return (
    <div className={cn("ace-card overflow-hidden", className)}>
      <div className="overflow-x-auto ace-scroll">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className={cn(
                    "px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row, i) => (
                <tr key={i} className="ace-table-row border-b border-border/50 last:border-0">
                  {columns.map((col) => (
                    <td key={String(col.key)} className={cn("px-4 py-3 text-foreground", col.className)}>
                      {col.render ? col.render(row) : String(row[col.key as keyof T] ?? "")}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination placeholder */}
      {data.length > 0 && (
        <div className="flex items-center justify-between border-t border-border px-4 py-2.5">
          <span className="text-xs text-muted-foreground">
            {data.length} {data.length === 1 ? "row" : "rows"}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled
              className="rounded px-2 py-1 text-xs text-muted-foreground opacity-50"
            >
              Previous
            </button>
            <button
              disabled
              className="rounded px-2 py-1 text-xs text-muted-foreground opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
