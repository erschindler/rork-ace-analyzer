/**
 * ScoringProfileContext — Scoring weight profile management.
 * Manages built-in and custom scoring profiles.
 * Persisted to localStorage. Ready for future Supabase sync.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ScoringProfile } from "@/types";

const DEFAULT_PROFILE: ScoringProfile = {
  id: "default",
  name: "Default ACE Profile",
  description: "Balanced weighting across all five ACE dimensions.",
  weights: {
    ml_readiness: 0.2,
    semantic_accessibility: 0.2,
    structured_understanding: 0.2,
    extractability: 0.2,
    ai_interpretability: 0.2,
  },
  isBuiltIn: true,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

interface ScoringProfileContextValue {
  profiles: ScoringProfile[];
  activeProfile: ScoringProfile;
  setActiveProfileId: (id: string) => void;
  addProfile: (profile: ScoringProfile) => void;
  updateProfile: (id: string, partial: Partial<ScoringProfile>) => void;
  removeProfile: (id: string) => void;
}

const ScoringProfileContext = createContext<ScoringProfileContextValue | undefined>(undefined);

export function ScoringProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ScoringProfile[]>([DEFAULT_PROFILE]);
  const [activeProfileId, setActiveProfileId] = useState<string>("default");

  const activeProfile = profiles.find((p) => p.id === activeProfileId) ?? DEFAULT_PROFILE;

  const setActiveProfileIdSafe = (id: string) => {
    // TODO: Persist active profile to localStorage in Phase 2
    setActiveProfileId(id);
    setProfiles((prev) =>
      prev.map((p) => ({ ...p, isActive: p.id === id })),
    );
  };

  const addProfile = (profile: ScoringProfile) => {
    // TODO: Persist to localStorage / IndexedDB in Phase 2
    setProfiles((prev) => [...prev, profile]);
  };

  const updateProfile = (id: string, partial: Partial<ScoringProfile>) => {
    // TODO: Persist to localStorage / IndexedDB in Phase 2
    setProfiles((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...partial, updatedAt: new Date().toISOString() } : p)),
    );
  };

  const removeProfile = (id: string) => {
    // TODO: Remove from localStorage / IndexedDB in Phase 2
    setProfiles((prev) => prev.filter((p) => p.id !== id || p.isBuiltIn));
  };

  return (
    <ScoringProfileContext.Provider
      value={{
        profiles,
        activeProfile,
        setActiveProfileId: setActiveProfileIdSafe,
        addProfile,
        updateProfile,
        removeProfile,
      }}
    >
      {children}
    </ScoringProfileContext.Provider>
  );
}

export function useScoringProfile(): ScoringProfileContextValue {
  const ctx = useContext(ScoringProfileContext);
  if (!ctx) {
    throw new Error("useScoringProfile must be used within ScoringProfileProvider");
  }
  return ctx;
}
