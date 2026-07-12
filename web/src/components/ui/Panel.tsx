/**
 * Panel — A bordered container with header, body, and optional footer.
 * Used for developer mode sections and general content grouping.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function Panel({
  title,
  subtitle,
  children,
  footer,
  action,
  className,
  bodyClassName,
}: PanelProps) {
  return (
    <div className={cn("ace-card flex flex-col", className)}>
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className={cn("flex-1 p-4", bodyClassName)}>
        {children}
      </div>
      {footer && (
        <div className="border-t border-border px-4 py-2.5">
          {footer}
        </div>
      )}
    </div>
  );
}
