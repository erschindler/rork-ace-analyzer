/**
 * BenchmarkContext — Benchmark run state management.
 * Tracks active and historical benchmark runs.
 * Connected to IndexedDB (Phase 2) / Supabase (future).
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { BenchmarkRun } from "@/types";

interface BenchmarkContextValue {
  runs: BenchmarkRun[];
  activeRun: BenchmarkRun | null;
  setActiveRun: (run: BenchmarkRun | null) => void;
  addRun: (run: BenchmarkRun) => void;
  updateRun: (id: string, partial: Partial<BenchmarkRun>) => void;
  clearRuns: () => void;
}

const BenchmarkContext = createContext<BenchmarkContextValue | undefined>(undefined);

export function BenchmarkProvider({ children }: { children: ReactNode }) {
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [activeRun, setActiveRun] = useState<BenchmarkRun | null>(null);

  const addRun = (run: BenchmarkRun) => {
    // TODO: Persist to IndexedDB via saveBenchmarkRun() in Phase 2
    setRuns((prev) => [run, ...prev]);
  };

  const updateRun = (id: string, partial: Partial<BenchmarkRun>) => {
    // TODO: Update in IndexedDB in Phase 2
    setRuns((prev) => prev.map((r) => (r.id === id ? { ...r, ...partial } : r)));
    setActiveRun((prev) => (prev?.id === id ? { ...prev, ...partial } : prev));
  };

  const clearRuns = () => {
    // TODO: Clear from IndexedDB in Phase 2
    setRuns([]);
  };

  return (
    <BenchmarkContext.Provider
      value={{ runs, activeRun, setActiveRun, addRun, updateRun, clearRuns }}
    >
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark(): BenchmarkContextValue {
  const ctx = useContext(BenchmarkContext);
  if (!ctx) {
    throw new Error("useBenchmark must be used within BenchmarkProvider");
  }
  return ctx;
}
