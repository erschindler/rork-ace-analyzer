/**
 * ACE Analyzer — Root Application
 * Routing + context provider hierarchy.
 * React Query is top-level; all app contexts nest inside.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { DashboardLayout } from "@/components/layout/DashboardLayout";
import {
  AppConfigProvider,
  HistoryProvider,
  BenchmarkProvider,
  ScoringProfileProvider,
} from "@/context";

import DashboardPage from "@/pages/dashboard";
import AnalyzePage from "@/pages/analyze";
import BenchmarkPage from "@/pages/benchmark";
import DeveloperPage from "@/pages/developer";
import HistoryPage from "@/pages/history";
import SettingsPage from "@/pages/settings";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AppConfigProvider>
      <HistoryProvider>
        <BenchmarkProvider>
          <ScoringProfileProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                  <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  <Route
                    path="/dashboard"
                    element={
                      <DashboardLayout>
                        <DashboardPage />
                      </DashboardLayout>
                    }
                  />
                  <Route
                    path="/analyze"
                    element={
                      <DashboardLayout>
                        <AnalyzePage />
                      </DashboardLayout>
                    }
                  />
                  <Route
                    path="/benchmark"
                    element={
                      <DashboardLayout>
                        <BenchmarkPage />
                      </DashboardLayout>
                    }
                  />
                  <Route
                    path="/developer"
                    element={
                      <DashboardLayout>
                        <DeveloperPage />
                      </DashboardLayout>
                    }
                  />
                  <Route
                    path="/history"
                    element={
                      <DashboardLayout>
                        <HistoryPage />
                      </DashboardLayout>
                    }
                  />
                  <Route
                    path="/settings"
                    element={
                      <DashboardLayout>
                        <SettingsPage />
                      </DashboardLayout>
                    }
                  />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route
                    path="*"
                    element={
                      <DashboardLayout>
                        <NotFound />
                      </DashboardLayout>
                    }
                  />
                </Routes>
              </BrowserRouter>
            </TooltipProvider>
          </ScoringProfileProvider>
        </BenchmarkProvider>
      </HistoryProvider>
    </AppConfigProvider>
  </QueryClientProvider>
);

export default App;
