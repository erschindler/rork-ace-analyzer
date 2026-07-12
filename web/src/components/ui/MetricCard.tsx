/**
 * MetricCard — Display a single metric with value, label, and trend indicator.
 */
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

type TrendDirection = "up" | "down" | "neutral";

interface MetricCardProps {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  trend?: {
    direction: TrendDirection;
    value: string;
  };
  accent?: "default" | "success" | "warning" | "destructive";
  className?: string;
}

const trendConfig: Record<TrendDirection, { icon: typeof ArrowUpRight; className: string }> = {
  up: { icon: ArrowUpRight, className: "text-success" },
  down: { icon: ArrowDownRight, className: "text-destructive" },
  neutral: { icon: Minus, className: "text-muted-foreground" },
};

const accentBorder: Record<string, string> = {
  default: "",
  success: "border-l-2 border-l-success",
  warning: "border-l-2 border-l-warning",
  destructive: "border-l-2 border-l-destructive",
};

export function MetricCard({
  label,
  value,
  unit,
  sublabel,
  trend,
  accent = "default",
  className,
}: MetricCardProps) {
  const TrendIcon = trend ? trendConfig[trend.direction].icon : null;

  return (
    <div className={cn("ace-card p-4", accentBorder[accent], className)}>
      <div className="flex items-center justify-between">
        <span className="ace-section-label">{label}</span>
        {trend && TrendIcon && (
          <span className={cn("flex items-center gap-0.5 text-xs font-medium", trendConfig[trend.direction].className)}>
            <TrendIcon className="h-3 w-3" />
            {trend.value}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="ace-metric-value text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {sublabel && (
        <p className="mt-1 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}
