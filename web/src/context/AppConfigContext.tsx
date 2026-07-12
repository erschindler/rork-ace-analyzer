/**
 * AppConfigContext — Global application configuration state.
 * Manages developer mode, export format, benchmark settings, theme.
 * Persisted to localStorage. Ready for future Supabase sync.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import type { AppConfig } from "@/types";

const DEFAULT_CONFIG: AppConfig = {
  developerMode: false,
  defaultScoringProfileId: "default",
  exportFormat: "json",
  benchmarkConcurrency: 3,
  theme: "dark",
  cloudSyncEnabled: false,
};

interface AppConfigContextValue {
  config: AppConfig;
  updateConfig: (partial: Partial<AppConfig>) => void;
  resetConfig: () => void;
}

const AppConfigContext = createContext<AppConfigContextValue | undefined>(undefined);

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);

  const updateConfig = (partial: Partial<AppConfig>) => {
    // TODO: Persist to localStorage / AsyncStorage in Phase 2
    setConfig((prev) => ({ ...prev, ...partial }));
  };

  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
  };

  return (
    <AppConfigContext.Provider value={{ config, updateConfig, resetConfig }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfigContextValue {
  const ctx = useContext(AppConfigContext);
  if (!ctx) {
    throw new Error("useAppConfig must be used within AppConfigProvider");
  }
  return ctx;
}
