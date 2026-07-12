/**
 * HistoryContext — Audit history state management.
 * Tracks completed and in-progress audit records.
 * Connected to IndexedDB (Phase 2) / Supabase (future).
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { AuditRecord } from "@/types";

interface HistoryContextValue {
  history: AuditRecord[];
  currentAudit: AuditRecord | null;
  setCurrentAudit: (audit: AuditRecord | null) => void;
  addToHistory: (audit: AuditRecord) => void;
  clearHistory: () => void;
  removeFromHistory: (id: string) => void;
}

const HistoryContext = createContext<HistoryContextValue | undefined>(undefined);

export function HistoryProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<AuditRecord[]>([]);
  const [currentAudit, setCurrentAudit] = useState<AuditRecord | null>(null);

  const addToHistory = (audit: AuditRecord) => {
    // TODO: Persist to IndexedDB via saveAudit() in Phase 2
    setHistory((prev) => [audit, ...prev]);
  };

  const clearHistory = () => {
    // TODO: Clear from IndexedDB in Phase 2
    setHistory([]);
  };

  const removeFromHistory = (id: string) => {
    // TODO: Remove from IndexedDB in Phase 2
    setHistory((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <HistoryContext.Provider
      value={{ history, currentAudit, setCurrentAudit, addToHistory, clearHistory, removeFromHistory }}
    >
      {children}
    </HistoryContext.Provider>
  );
}

export function useHistory(): HistoryContextValue {
  const ctx = useContext(HistoryContext);
  if (!ctx) {
    throw new Error("useHistory must be used within HistoryProvider");
  }
  return ctx;
}
