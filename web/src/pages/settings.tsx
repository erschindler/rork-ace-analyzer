/**
 * Settings Page — Configuration for scoring profiles, export, benchmarks, dev mode.
 * Phase 1: UI scaffolding only — no persistence logic.
 */
import { PageLayout } from "@/components/layout/PageLayout";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useAppConfig, useScoringProfile } from "@/context";

export default function SettingsPage() {
  const { config, updateConfig } = useAppConfig();
  const { profiles, activeProfile } = useScoringProfile();

  const weightEntries = Object.entries(activeProfile.weights ?? {});

  return (
    <PageLayout
      title="Settings"
      subtitle="Configure scoring profiles, exports, benchmarks, and developer options"
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Scoring Weight Profiles */}
        <Panel
          title="Scoring Weight Profiles"
          subtitle="Configure metric weights for ACE scoring"
          className="lg:col-span-2"
          action={<Button variant="outline" size="sm">New Profile</Button>}
        >
          <div className="space-y-4">
            {/* Profile selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Active Profile</label>
              <select className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring">
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.isBuiltIn ? "(built-in)" : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Weight sliders */}
            <div className="space-y-3">
              {weightEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground">No weights configured in active profile.</p>
              ) : (
                weightEntries.map(([key, value]) => (
                  <div key={key} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium capitalize text-foreground">
                        {key.replace(/_/g, " ")}
                      </label>
                      <span className="font-mono text-xs text-muted-foreground">
                        {((value as number) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <Slider
                      value={[(value as number) * 100]}
                      max={100}
                      step={5}
                      onValueChange={() => { /* TODO: Phase 2 — updateProfile */ }}
                      className="opacity-60"
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </Panel>

        {/* Export Settings */}
        <Panel
          title="Export Settings"
          subtitle="Default report format and options"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Default Format</label>
              <select
                value={config.exportFormat}
                onChange={(e) => updateConfig({ exportFormat: e.target.value as "json" | "html" | "pdf" | "csv" })}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="json">JSON</option>
                <option value="html">HTML</option>
                <option value="pdf">PDF</option>
                <option value="csv">CSV</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Include raw evidence</p>
                <p className="text-xs text-muted-foreground">Embed raw evidence in exports</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Include recommendations</p>
                <p className="text-xs text-muted-foreground">Add AI-generated recommendations</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>
        </Panel>

        {/* Benchmark Configuration */}
        <Panel
          title="Benchmark Configuration"
          subtitle="Default benchmark execution settings"
        >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Default Concurrency</label>
                <span className="font-mono text-xs text-muted-foreground">{config.benchmarkConcurrency}</span>
              </div>
              <Slider
                value={[config.benchmarkConcurrency ?? 3]}
                min={1}
                max={10}
                step={1}
                onValueChange={(v) => updateConfig({ benchmarkConcurrency: v[0] })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-save runs</p>
                <p className="text-xs text-muted-foreground">Persist benchmark runs to IndexedDB</p>
              </div>
              <Switch defaultChecked />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Fail on error</p>
                <p className="text-xs text-muted-foreground">Stop benchmark if a URL fails</p>
              </div>
              <Switch />
            </div>
          </div>
        </Panel>

        {/* Developer Mode Toggles */}
        <Panel
          title="Developer Mode"
          subtitle="Enable advanced engine inspection features"
          className="lg:col-span-2"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Enable Developer Mode</p>
                <p className="text-xs text-muted-foreground">Show raw evidence, normalized data, scoring breakdown, and rule engine output</p>
              </div>
              <Switch
                checked={config.developerMode}
                onCheckedChange={(checked) => updateConfig({ developerMode: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Verbose logging</p>
                <p className="text-xs text-muted-foreground">Log detailed engine output to console</p>
              </div>
              <Switch />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Cloud Sync (future)</p>
                <p className="text-xs text-muted-foreground">Sync audits and benchmarks to Supabase — not yet available</p>
              </div>
              <Switch
                checked={config.cloudSyncEnabled}
                onCheckedChange={(checked) => updateConfig({ cloudSyncEnabled: checked })}
                disabled
              />
            </div>
          </div>
        </Panel>
      </div>
    </PageLayout>
  );
}
