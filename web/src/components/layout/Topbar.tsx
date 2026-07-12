/**
 * Topbar — Clean top navigation bar with mobile menu toggle and status.
 */
import { Menu, Search, Bell } from "lucide-react";

interface TopbarProps {
  title: string;
  breadcrumb?: string;
  onMenuClick: () => void;
}

export function Topbar({ title, breadcrumb, onMenuClick }: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur-sm lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="flex flex-col leading-tight">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-foreground">{title}</h1>
          </div>
          {breadcrumb && (
            <span className="text-[11px] text-muted-foreground">{breadcrumb}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Search placeholder */}
        <div className="hidden items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-1.5 sm:flex">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search audits, benchmarks..."
            className="w-48 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>

        {/* Notifications placeholder */}
        <button className="rounded-md p-1.5 text-muted-foreground hover:bg-muted">
          <Bell className="h-4 w-4" />
        </button>

        {/* Status indicator */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          <span className="text-xs font-medium text-muted-foreground">Engine Idle</span>
        </div>
      </div>
    </header>
  );
}
