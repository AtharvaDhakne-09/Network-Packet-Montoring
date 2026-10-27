import { useEffect, useState } from "react";
import { Save, Undo2 } from "lucide-react";
import { Alert, Card, Field, Toggle } from "../components/ui";
import PriorityRulesEditor from "../components/PriorityRulesEditor";
import { useCapture } from "../hooks/useCapture";
import { formatNumber } from "../lib/format";
import type { AppSettings } from "../types";

export default function Settings() {
  const { settings, settingsMeta, saveSettings, resetSettings, error, notice, clearError, clearNotice } = useCapture();
  const [draft, setDraft] = useState<AppSettings | null>(settings);
  const [validation, setValidation] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const bounds = settingsMeta?.options.bounds;

  if (!draft) {
    return <Alert tone="info" title="Loading settings">Reading settings from the backend…</Alert>;
  }

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const validate = (): boolean => {
    const issues: Record<string, string> = {};
    const numeric: [keyof AppSettings, string][] = [
      ["max_packet_history", "Maximum packet history"],
      ["max_capture_duration", "Capture duration limit"],
      ["max_capture_packets", "Capture packet limit"],
      ["default_capacity", "Default buffer capacity"],
      ["default_service_rate", "Default processing rate"],
      ["default_link_rate_mbps", "Default link rate"],
      ["default_time_scale", "Default time scale"],
      ["sessions_retained", "Retained sessions"],
      ["chart_refresh_ms", "Chart refresh"],
      ["dashboard_refresh_ms", "Dashboard refresh"],
    ];
    numeric.forEach(([key, label]) => {
      const value = draft[key] as number;
      if (value === null || value === undefined || Number.isNaN(value) || value < 0) {
        issues[key as string] = `${label} must be a non-negative number.`;
        return;
      }
      const range = bounds?.[key as string];
      if (range && (value < range[0] || value > range[1])) {
        issues[key as string] = `${label} must be between ${formatNumber(range[0])} and ${formatNumber(range[1])}.`;
      }
    });
    if (draft.default_filter.length > 200) {
      issues.default_filter = "Capture filter is too long.";
    }
    draft.priority_rules.forEach((rule, index) => {
      if (rule.enabled && rule.match !== "any" && rule.value.trim() === "") {
        issues[`rule-${index}`] = `Rule ${index + 1} needs a value.`;
      }
      if (rule.priority < 1 || rule.priority > 4) {
        issues[`rule-${index}`] = `Rule ${index + 1} priority must be 1–4.`;
      }
    });
    setValidation(issues);
    return Object.keys(issues).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      await saveSettings(draft);
    } finally {
      setSaving(false);
    }
  };

  const numericField = (
    key: keyof AppSettings,
    label: string,
    hint?: string,
    step = 1,
  ) => (
    <Field label={label} hint={hint} error={validation[key as string]}>
      <input
        type="number"
        className="input"
        min={bounds?.[key as string]?.[0] ?? 0}
        max={bounds?.[key as string]?.[1]}
        step={step}
        value={draft[key] as number}
        onChange={(event) => set(key, Number(event.target.value) as AppSettings[typeof key])}
      />
    </Field>
  );

  return (
    <div className="space-y-4">
      {error && <Alert tone="error" title="Settings error" onClose={clearError}>{error}</Alert>}
      {notice && <Alert tone="success" onClose={clearNotice}>{notice}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary" onClick={() => void handleSave()} disabled={saving}>
          <Save size={14} /> Save settings
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void resetSettings().then(() => setDraft(settingsMeta?.defaults ?? null))}
        >
          <Undo2 size={14} /> Reset to defaults
        </button>
        {settingsMeta && (
          <span className="text-xs text-slate-500">
            Stored at backend/data/settings.json · max history currently {formatNumber(settings?.max_packet_history ?? 0)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Capture" subtitle="Controls applied to new capture sessions">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numericField("max_packet_history", "Maximum packet history", "Retained metadata records per session", 100)}
            {numericField("max_capture_packets", "Capture packet limit", "0 = unlimited", 100)}
            {numericField("max_capture_duration", "Capture duration limit (s)", "0 = unlimited", 1)}
            {numericField("sessions_retained", "Retained sessions", "Older stopped sessions are pruned")}
            <div className="sm:col-span-2">
              <Field label="Default capture filter" hint="BPF syntax, e.g. tcp or ip6" error={validation.default_filter}>
                <input
                  className="input font-mono"
                  value={draft.default_filter}
                  onChange={(event) => set("default_filter", event.target.value)}
                />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Interface" subtitle="Refresh rate and dashboard cadence">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numericField("chart_refresh_ms", "Chart refresh (ms)", "How often analytics charts refetch", 250)}
            {numericField("dashboard_refresh_ms", "Dashboard refresh (ms)", "Status polling interval", 250)}
            <div className="sm:col-span-2 flex items-center justify-between rounded-lg border border-surface-700/70 bg-surface-850 px-3 py-2">
              <span className="text-xs text-slate-300">Animations on charts and live widgets</span>
              <Toggle checked={draft.animations} onChange={(value) => set("animations", value)} label={draft.animations ? "Enabled" : "Disabled"} />
            </div>
          </div>
        </Card>

        <Card title="Simulation defaults" subtitle="Used as starting values in Router Simulation and Policy Comparison">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {numericField("default_capacity", "Buffer capacity (packets)")}
            {numericField("default_service_rate", "Processing rate (packets/s)", undefined, 0.1)}
            {numericField("default_link_rate_mbps", "Link rate (Mbps)", undefined, 0.1)}
            <Field label="Rate mode">
              <select
                className="input"
                value={draft.default_rate_mode}
                onChange={(event) => set("default_rate_mode", event.target.value as "pps" | "bps")}
              >
                <option value="pps">Packets per second</option>
                <option value="bps">Link rate (bits per second)</option>
              </select>
            </Field>
            <Field label="Replay time scale" hint="0 = maximum speed">
              <select
                className="input"
                value={draft.default_time_scale}
                onChange={(event) => set("default_time_scale", Number(event.target.value))}
              >
                {[0, 1, 2, 5, 10, 25, 50].map((scale) => (
                  <option key={scale} value={scale}>
                    {scale === 0 ? "Max speed" : `${scale}×`}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>

        <Card title="Data retention" subtitle="Keep memory bounded">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>Packet payloads are never stored — only metadata fields.</li>
            <li>Per-session history is capped by the maximum packet history setting.</li>
            <li>Only the most recent stopped sessions are retained for simulation and history.</li>
            <li>CSV exports contain metadata only and are sanitized against spreadsheet formula injection.</li>
          </ul>
        </Card>
      </div>

      <Card title="Priority classification rules" subtitle="Simulated priorities for the router model">
        <PriorityRulesEditor rules={draft.priority_rules} onChange={(rules) => set("priority_rules", rules)} />
        {Object.entries(validation)
          .filter(([key]) => key.startsWith("rule-"))
          .map(([key, message]) => (
            <p key={key} className="mt-1 text-xs text-rose-400">{message}</p>
          ))}
      </Card>
    </div>
  );
}
