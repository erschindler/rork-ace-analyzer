/**
 * PageLayout — Standard page wrapper with consistent spacing and optional header.
 */
import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui/SectionHeader";

interface PageLayoutProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}

export function PageLayout({ title, subtitle, action, children }: PageLayoutProps) {
  return (
    <div className="space-y-6">
      <SectionHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </div>
  );
}
