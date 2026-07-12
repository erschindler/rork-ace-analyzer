/**
 * DashboardLayout — Primary app shell with sidebar + topbar + content area.
 * Wraps all routed pages.
 */
import { useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

const pageMeta: Record<string, { title: string; breadcrumb: string }> = {
  "/dashboard": { title: "Dashboard", breadcrumb: "Overview" },
  "/analyze": { title: "Page Analyzer", breadcrumb: "Audit a single webpage" },
  "/benchmark": { title: "Benchmark Runner", breadcrumb: "Batch URL evaluation" },
  "/developer": { title: "Developer Mode", breadcrumb: "Engine internals & debugging" },
  "/history": { title: "History", breadcrumb: "Past audit records" },
  "/settings": { title: "Settings", breadcrumb: "Configuration & profiles" },
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const meta = pageMeta[location.pathname] ?? { title: "ACE Analyzer", breadcrumb: "" };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="lg:pl-60">
        <Topbar
          title={meta.title}
          breadcrumb={meta.breadcrumb}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
