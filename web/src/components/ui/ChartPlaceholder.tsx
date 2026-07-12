/**
 * ChartPlaceholder — Placeholder for future chart visualizations.
 * Displays a labeled empty area with grid lines for visual context.
 */
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChartPlaceholderProps {
  label?: string;
  height?: string;
  className?: string;
}

export function ChartPlaceholder({
  label = "Chart",
  height = "h-48",
  className,
}: ChartPlaceholderProps) {
  return (
    <div className={cn("ace-card flex flex-col", className)}>
      <div className="border-b border-border px-4 py-2.5">
        <span className="ace-section-label">{label}</span>
      </div>
      <div className={cn("relative flex items-center justify-center", height)}>
        {/* Grid lines */}
        <div className="absolute inset-0 grid grid-cols-6 gap-px opacity-30">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="border-l border-border" />
          ))}
        </div>
        <div className="absolute inset-0 grid grid-rows-4 gap-px opacity-30">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border-t border-border" />
          ))}
        </div>
        {/* Placeholder indicator */}
        <div className="relative flex flex-col items-center gap-2 text-muted-foreground/60">
          <BarChart3 className="h-8 w-8" />
          <span className="text-xs font-medium">Chart data pending</span>
        </div>
      </div>
    </div>
  );
}
