import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Pause, Play, RotateCcw, Route, SkipForward, Square } from "lucide-react";
import { Alert, Card, EmptyState, Field, MetricCard } from "../components/ui";
import PriorityRulesEditor from "../components/PriorityRulesEditor";
import { useCapture } from "../hooks/useCapture";
import { useSimulation } from "../hooks/useSimulation";
import { formatBytesPerSecond, formatMs, formatNumber, PRIORITY_COLORS, PRIORITY_LABELS } from "../lib/format";
import type { PriorityRule } from "../types";

export default function RouterSimulation() {
  const { sessions, activeSession, settings, metrics: captureMetrics } = useCapture();
  const simulation = useSimulation();
  const { state } = simulation;

  const sessionOptions = useMemo(() => {
    const list = sessions.filter((session) => session.retained_packets > 0);
    if (activeSession && activeSession.retained_packets > 0 && !list.find((s) => s.session_id === activeSession.session_id)) {
      return [activeSession, ...list];
    }
    return list;
  }, [sessions, activeSession]);

  const [sessionId, setSessionId] = useState<string>("");
  const [window, setWindow] = useState(500);
  const [policy, setPolicy] = useState<"fifo" | "priority">("fifo");
  const [capacity, setCapacity] = useState(settings?.default_capacity ?? 32);
  const [rateMode, setRateMode] = useState<"pps" | "bps">(settings?.default_rate_mode ?? "pps");
  const [serviceRate, setServiceRate] = useState(settings?.default_service_rate ?? 200);
  const [linkRate, setLinkRate] = useState(settings?.default_link_rate_mbps ?? 100);
  const [timeScale, setTimeScale] = useState(settings?.default_time_scale ?? 1);
  const [rules, setRules] = useState<PriorityRule[]>(settings?.priority_rules ?? []);

  useEffect(() => {
    if (!sessionId && sessionOptions.length > 0) setSessionId(sessionOptions[0].session_id);
  }, [sessionId, sessionOptions]);

  useEffect(() => {
    if (settings) {
      setCapacity((prev) => (prev === 32 ? settings.default_capacity : prev));
      setRules((prev) => (prev.length === 0 ? settings.priority_rules : prev));
    }
  }, [settings]);

  const start = () => {
    void simulation.start({
      policy,
      capacity,
      rate_mode: rateMode,
      service_rate: serviceRate,
      link_rate_mbps: linkRate,
      time_scale: timeScale,
      session_id: sessionId || null,
      window,
      priority_rules: rules,
      default_priority: 3,
    });
  };

  const running = state?.status === "running";
  const paused = state?.paused ?? false;

  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Simulation notice">
        The router simulator replays metadata from captured packets through a local buffer model. Simulated drops are
        <strong> not </strong> real network packet losses, and the simulator never touches, blocks or forwards real traffic.
      </Alert>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card title="Simulation source" subtitle="Captured packets feed the simulated buffer">
            <div className="space-y-3">
              <Field label="Capture session">
                <select className="input" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
                  <option value="">{sessionOptions.length ? "Select a session" : "No captured sessions yet"}</option>
                  {sessionOptions.map((session) => (
                    <option key={session.session_id} value={session.session_id}>
                      {session.session_id} · {session.interface_name} · {session.retained_packets} packets
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Capture window (packets)" hint="Bounded trace replayed at capture timestamps">
                <input
                  type="number"
                  className="input"
                  min={1}
                  max={50000}
                  value={window}
                  onChange={(event) => setWindow(Number(event.target.value))}
                />
              </Field>
              <Field label="Scheduling policy">
                <select className="input" value={policy} onChange={(event) => setPolicy(event.target.value as "fifo" | "priority")}>
                  <option value="fifo">FIFO circular queue</option>
                  <option value="priority">Priority queue (binary min-heap)</option>
                </select>
              </Field>
              <Field label="Buffer capacity (packets)">
                <input
                  type="number"
                  className="input"
                  min={2}
                  max={4096}
                  value={capacity}
                  onChange={(event) => setCapacity(Number(event.target.value))}
                />
              </Field>
              <Field label="Rate mode">
                <select className="input" value={rateMode} onChange={(event) => setRateMode(event.target.value as "pps" | "bps")}>
                  <option value="pps">Packets per second</option>
                  <option value="bps">Link rate (bits per second)</option>
                </select>
              </Field>
              {rateMode === "pps" ? (
                <Field label="Processing rate (packets/s)">
                  <input
                    type="number"
                    className="input"
                    min={0.1}
                    step={0.1}
                    value={serviceRate}
                    onChange={(event) => setServiceRate(Number(event.target.value))}
                  />
                </Field>
              ) : (
                <Field label="Link rate (Mbps)">
                  <input
                    type="number"
                    className="input"
                    min={0.1}
                    step={0.1}
                    value={linkRate}
                    onChange={(event) => setLinkRate(Number(event.target.value))}
                  />
                </Field>
              )}
              <Field label="Replay time scale" hint="0 = as fast as possible">
                <select className="input" value={timeScale} onChange={(event) => setTimeScale(Number(event.target.value))}>
                  {[0, 1, 2, 5, 10, 25, 50].map((scale) => (
                    <option key={scale} value={scale}>
                      {scale === 0 ? "Max speed" : `${scale}×`}
                    </option>
                  ))}
                </select>
              </Field>
              <button type="button" className="btn-primary w-full" onClick={start} disabled={simulation.busy || !sessionId}>
                <Route size={14} /> Start simulation
              </button>
              {simulation.error && <Alert tone="error">{simulation.error}</Alert>}
            </div>
          </Card>

          <Card title="Priority classification rules" subtitle="Simulated, not real QoS">
            <PriorityRulesEditor rules={rules} onChange={setRules} />
          </Card>
        </div>

        <div className="space-y-4">
          {!state ? (
            <EmptyState
              icon={<Route size={30} />}
              title="No simulation running"
              description="Capture some traffic, then choose a session and start the simulation to replay packets through the FIFO queue or the priority heap."
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MetricCard label="Offered" value={formatNumber(state.metrics.offered_packets)} hint={`of ${formatNumber(state.progress.total)} in trace`} />
                <MetricCard label="Accepted" value={formatNumber(state.metrics.accepted_packets)} tone="accent" />
                <MetricCard label="Processed" value={formatNumber(state.metrics.processed_packets)} tone="success" />
                <MetricCard label="Simulated drops" value={formatNumber(state.metrics.dropped_packets)} tone="danger" hint={`${formatNumber(state.metrics.drop_rate_percent, 2)}% of offered`} />
                <MetricCard label="Queue size" value={formatNumber(state.queue?.size ?? 0)} hint={`capacity ${formatNumber(state.metrics.buffer_capacity)}`} />
                <MetricCard label="Avg wait" value={formatMs(state.metrics.average_wait_seconds)} />
                <MetricCard label="Max wait" value={formatMs(state.metrics.max_wait_seconds)} />
                <MetricCard label="Throughput" value={`${formatNumber(state.metrics.packet_throughput_pps, 1)} pkt/s`} hint={formatBytesPerSecond(state.metrics.byte_throughput_bps)} />
              </div>

              <Card
                title={`Simulation ${state.sim_id}`}
                subtitle={`${state.config.policy === "fifo" ? "FIFO circular queue" : "Priority min-heap"} · ${state.source.interface_name ?? "session"}`}
                actions={
                  <>
                    {paused ? (
                      <button type="button" className="btn-primary" onClick={() => void simulation.resume()} disabled={!running || simulation.busy}>
                        <Play size={14} /> Resume
                      </button>
                    ) : (
                      <button type="button" className="btn-ghost" onClick={() => void simulation.pause()} disabled={!running || simulation.busy}>
                        <Pause size={14} /> Pause
                      </button>
                    )}
                    <button type="button" className="btn-ghost" onClick={() => void simulation.step()} disabled={!running || simulation.busy}>
                      <SkipForward size={14} /> Step
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void simulation.reset()} disabled={simulation.busy}>
                      <RotateCcw size={14} /> Reset
                    </button>
                    <button type="button" className="btn-danger" onClick={() => void simulation.stop()} disabled={simulation.busy}>
                      <Square size={14} /> Stop
                    </button>
                  </>
                }
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Buffer contents ({state.queue?.type === "min_heap" ? "heap order" : "FIFO order"})
                    </h3>
                    <div className="max-h-64 space-y-1 overflow-auto">
                      {(state.config.policy === "priority" ? state.queue?.priority_order ?? [] : state.queue?.contents ?? [])
                        .slice(0, 40)
                        .map((packet, index) => (
                          <div
                            key={`${packet.event_id}-${index}`}
                            className="flex items-center justify-between rounded border border-surface-700/70 bg-surface-850 px-2 py-1 text-xs"
                          >
                            <span className="font-mono text-slate-300">
                              {index + 1}. {packet.src_ip ?? "—"}:{packet.src_port ?? "—"} → {packet.dst_ip ?? "—"}:{packet.dst_port ?? "—"}
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="text-slate-500">{packet.length}B</span>
                              <span className="badge" style={{ backgroundColor: `${PRIORITY_COLORS[packet.priority]}22`, color: PRIORITY_COLORS[packet.priority] }}>
                                P{packet.priority} {PRIORITY_LABELS[packet.priority]}
                              </span>
                            </span>
                          </div>
                        ))}
                      {(state.queue?.size ?? 0) === 0 && (
                        <p className="text-xs text-slate-500">Buffer is empty.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent simulation events</h3>
                    <div className="max-h-64 space-y-1 overflow-auto font-mono text-[11px]">
                      {[...state.events].reverse().map((event, index) => (
                        <div key={`${event.event_id}-${event.type}-${index}`} className="flex items-center gap-2 border-b border-surface-800/60 py-0.5">
                          <span className="w-16 text-slate-500">{event.type}</span>
                          <span className="text-slate-400">{event.event_id.slice(0, 8)}</span>
                          <span className="text-slate-500">q={event.queue_size}</span>
                          {event.priority !== undefined && (
                            <span style={{ color: PRIORITY_COLORS[event.priority] }}>P{event.priority}</span>
                          )}
                          {event.type === "complete" && <span className="text-emerald-400">wait {formatMs(event.waiting_seconds ?? 0)}</span>}
                          {event.type === "drop" && <span className="text-rose-400">{event.reason}</span>}
                        </div>
                      ))}
                      {state.events.length === 0 && <p className="text-xs text-slate-500">No events yet.</p>}
                    </div>
                  </div>
                </div>
                {!state.metrics.accounting_balanced && (
                  <Alert tone="warning" title="Accounting check">
                    <span className="flex items-center gap-1">
                      <AlertTriangle size={12} /> Offered ≠ accepted + dropped for the current window. This can occur mid-run.
                    </span>
                  </Alert>
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Capture telemetry: {formatNumber(captureMetrics?.total_packets ?? 0)} packets observed on the selected interface.
        Simulation metrics describe only events inside the simulated router.
      </p>
    </div>
  );
}
