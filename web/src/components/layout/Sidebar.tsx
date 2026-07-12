/**
 * Sidebar — Polished left navigation with ACE branding and nav links.
 * Collapsible on mobile via a overlay toggle.
 */
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Search,
  Gauge,
  Terminal,
  History,
  Settings,
  Activity,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  open: boolean;
  onClose: () => void;
}

const navItems = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/analyze", label: "Analyze", icon: Search },
  { to: "/benchmark", label: "Benchmark", icon: Gauge },
  { to: "/developer", label: "Developer Mode", icon: Terminal },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ open, onClose }: SidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Brand */}
        <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary">
              <Activity className="h-4 w-4 text-sidebar-primary-foreground" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-sidebar-foreground">ACE Analyzer</span>
              <span className="text-[10px] text-muted-foreground">AI Comprehension Engine</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-sidebar-foreground/60 hover:bg-sidebar-accent lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto ace-scroll px-3 py-4">
          <div className="mb-2 px-3">
            <span className="ace-section-label text-sidebar-foreground/40">Workspace</span>
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">v0.1.0 — Phase 1</span>
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Local-first
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
