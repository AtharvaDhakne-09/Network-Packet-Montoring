import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GitCompareArrows, Play } from "lucide-react";
import { Alert, Card, EmptyState, Field } from "../components/ui";
import PriorityRulesEditor from "../components/PriorityRulesEditor";
import { useCapture } from "../hooks/useCapture";
import { api } from "../services/api";
import { formatBytesPerSecond, formatMs, formatNumber } from "../lib/format";
import type { ComparisonResult, PriorityRule, SimulationMetrics } from "../types";

interface MetricRow {
  key: keyof SimulationMetrics;
  label: string;
  format: (value: number) => string;
  lowerIsBetter: boolean;
}

const ROWS: MetricRow[] = [
  { key: "offered_packets", label: "Offered packets", format: (v) => formatNumber(v), lowerIsBetter: false },
  { key: "accepted_packets", label: "Accepted packets", format: (v) => formatNumber(v), lowerIsBetter: false },
  { key: "processed_packets", label: "Processed packets", format: (v) => formatNumber(v), lowerIsBetter: false },
  { key: "dropped_packets", label: "Simulated drops", format: (v) => formatNumber(v), lowerIsBetter: true },
  { key: "drop_rate_percent", label: "Simulated drop rate", format: (v) => `${formatNumber(v, 2)} %`, lowerIsBetter: true },
  { key: "average_wait_seconds", label: "Average queue wait", format: (v) => formatMs(v), lowerIsBetter: true },
  { key: "max_wait_seconds", label: "Maximum queue wait", format: (v) => formatMs(v), lowerIsBetter: true },
  { key: "packet_throughput_pps", label: "Packet throughput", format: (v) => `${formatNumber(v, 2)} pkt/s`, lowerIsBetter: false },
  { key: "byte_throughput_bps", label: "Byte throughput", format: (v) => formatBytesPerSecond(v), lowerIsBetter: false },
  { key: "peak_buffer_utilization_percent", label: "Peak buffer utilization", format: (v) => `${formatNumber(v, 1)} %`, lowerIsBetter: true },
  { key: "average_buffer_occupancy", label: "Average buffer occupancy", format: (v) => `${formatNumber(v, 2)} pkts`, lowerIsBetter: true },
];

export default function PolicyComparison() {
  const { sessions, activeSession, settings } = useCapture();
  const [sessionId, setSessionId] = useState("");
  const [window, setWindow] = useState(400);
  const [offset, setOffset] = useState(0);
  const [capacity, setCapacity] = useState(settings?.default_capacity ?? 16);
  const [rateMode, setRateMode] = useState<"pps" | "bps">(settings?.default_rate_mode ?? "pps");
  const [serviceRate, setServiceRate] = useState(settings?.default_service_rate ?? 200);
  const [linkRate, setLinkRate] = useState(settings?.default_link_rate_mbps ?? 100);
  const [rules, setRules] = useState<PriorityRule[]>(settings?.priority_rules ?? []);
  const [result, setResult] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sessionOptions = useMemo(
    () => sessions.filter((session) => session.retained_packets > 0),
    [sessions],
  );

  const activeId = sessionId || activeSession?.session_id || sessionOptions[0]?.session_id || "";

  const runComparison = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await api.compare({
        session_id: activeId || null,
        window,
        offset,
        capacity,
        rate_mode: rateMode,
        service_rate: serviceRate,
        link_rate_mbps: linkRate,
        priority_rules: rules,
        default_priority: 3,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => {
    if (!result) return [];
    return [
      { metric: "Drop rate %", fifo: result.fifo.drop_rate_percent, priority: result.priority.drop_rate_percent },
      { metric: "Avg wait (ms)", fifo: result.fifo.average_wait_seconds * 1000, priority: result.priority.average_wait_seconds * 1000 },
      { metric: "Max wait (ms)", fifo: result.fifo.max_wait_seconds * 1000, priority: result.priority.max_wait_seconds * 1000 },
      { metric: "Peak util %", fifo: result.fifo.peak_buffer_utilization_percent, priority: result.priority.peak_buffer_utilization_percent },
      { metric: "Throughput pkt/s", fifo: result.fifo.packet_throughput_pps, priority: result.priority.packet_throughput_pps },
    ];
  }, [result]);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Identical trace, two policies">
        Both policies replay the exact same captured packet window through their own buffer model. Results below are
        computed from those simulation events — nothing is hardcoded or precomputed.
      </Alert>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card title="Experiment setup" subtitle="Bounded capture window · identical for both runs">
            <div className="space-y-3">
              <Field label="Capture session">
                <select className="input" value={activeId} onChange={(event) => setSessionId(event.target.value)}>
                  <option value="">{sessionOptions.length ? "Select a session" : "No captured sessions yet"}</option>
                  {sessionOptions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.session_id} · {session.retained_packets} packets
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Window (packets)">
                  <input type="number" className="input" min={1} max={50000} value={window} onChange={(event) => setWindow(Number(event.target.value))} />
                </Field>
                <Field label="Offset">
                  <input type="number" className="input" min={0} value={offset} onChange={(event) => setOffset(Number(event.target.value))} />
                </Field>
              </div>
              <Field label="Buffer capacity (packets)">
                <input type="number" className="input" min={2} max={4096} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
              </Field>
              <Field label="Rate mode">
                <select className="input" value={rateMode} onChange={(event) => setRateMode(event.target.value as "pps" | "bps")}>
                  <option value="pps">Packets per second</option>
                  <option value="bps">Link rate</option>
                </select>
              </Field>
              {rateMode === "pps" ? (
                <Field label="Processing rate (packets/s)">
                  <input type="number" className="input" min={0.1} value={serviceRate} onChange={(event) => setServiceRate(Number(event.target.value))} />
                </Field>
              ) : (
                <Field label="Link rate (Mbps)">
                  <input type="number" className="input" min={0.1} value={linkRate} onChange={(event) => setLinkRate(Number(event.target.value))} />
                </Field>
              )}
              <button type="button" className="btn-primary w-full" onClick={() => void runComparison()} disabled={busy || !activeId}>
                <Play size={14} /> Run comparison on identical trace
              </button>
              {error && <Alert tone="error">{error}</Alert>}
            </div>
          </Card>

          <Card title="Priority classification rules" subtitle="Applied identically to both policies">
            <PriorityRulesEditor rules={rules} onChange={setRules} />
          </Card>
        </div>

        <div className="space-y-4">
          {!result ? (
            <EmptyState
              icon={<GitCompareArrows size={30} />}
              title="No comparison yet"
              description="Pick a capture session that already contains packets and run the comparison. Both policies will process the same window."
            />
          ) : (
            <>
              <Card title="Comparison table" subtitle={`${formatNumber(result.trace.packets)} packets · capacity ${result.trace.capacity} · ${result.trace.rate_mode === "pps" ? `${result.trace.service_rate} pkt/s` : `${result.trace.link_rate_mbps} Mbps`}`}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-xs">
                    <thead>
                      <tr className="text-left text-slate-500">
                        <th className="py-2">Metric</th>
                        <th className="py-2 text-right">FIFO circular queue</th>
                        <th className="py-2 text-right">Priority min-heap</th>
                        <th className="py-2 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ROWS.map((row) => {
                        const fifoValue = result.fifo[row.key] as number;
                        const priorityValue = result.priority[row.key] as number;
                        const delta = priorityValue - fifoValue;
                        const improved = row.lowerIsBetter ? delta < -1e-9 : delta > 1e-9;
                        const worsened = row.lowerIsBetter ? delta > 1e-9 : delta < -1e-9;
                        return (
                          <tr key={row.key} className="border-t border-surface-800">
                            <td className="py-2 text-slate-300">{row.label}</td>
                            <td className="py-2 text-right font-mono text-slate-200">{row.format(fifoValue)}</td>
                            <td className="py-2 text-right font-mono text-slate-200">{row.format(priorityValue)}</td>
                            <td className={`py-2 text-right font-mono ${improved ? "text-emerald-400" : worsened ? "text-rose-400" : "text-slate-500"}`}>
                              {delta === 0 ? "0" : `${delta > 0 ? "+" : ""}${row.format(delta)}`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Normalized comparison" subtitle="Lower is better for drop rate, wait time and utilization">
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
                        <XAxis dataKey="metric" stroke="#64748b" fontSize={10} interval={0} angle={-12} textAnchor="end" height={50} />
                        <YAxis stroke="#64748b" fontSize={11} />
                        <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar dataKey="fifo" fill="#38bdf8" name="FIFO" radius={[3, 3, 0, 0]} />
                        <Bar dataKey="priority" fill="#f472b6" name="Priority" radius={[3, 3, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card title="What the experiment shows" subtitle="Generated from the measured metrics">
                  <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                    {result.explanation.map((line, index) => (
                      <li key={index}>{line}</li>
                    ))}
                  </ul>
                </Card>
              </div>

              <p className="text-xs text-slate-500">
                Simulated drops describe the router model only. The comparison does not modify or drop any real packet on
                your network.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
