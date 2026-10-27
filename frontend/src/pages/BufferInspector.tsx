import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, Layers, Network, RotateCw } from "lucide-react";
import { Alert, Card, EmptyState, Field, MetricCard } from "../components/ui";
import PacketDetail from "../components/PacketDetail";
import { useCapture } from "../hooks/useCapture";
import { useSimulation } from "../hooks/useSimulation";
import { formatNumber, PRIORITY_COLORS } from "../lib/format";
import type { PacketMetadata } from "../types";

function HeapTree({
  nodes,
  highlight,
}: {
  nodes: { index: number; priority: number; parent: number | null; left: number | null; right: number | null; item: PacketMetadata }[];
  highlight: Set<number>;
}) {
  const width = 720;
  const levelHeight = 78;
  const positions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    nodes.forEach((node) => {
      const level = Math.floor(Math.log2(node.index + 1));
      const firstOfLevel = 2 ** level - 1;
      const positionInLevel = node.index - firstOfLevel;
      const slots = 2 ** level;
      const x = ((positionInLevel + 0.5) / slots) * width;
      const y = level * levelHeight + 36;
      map.set(node.index, { x, y });
    });
    return map;
  }, [nodes]);

  const depth = useMemo(() => (nodes.length === 0 ? 0 : Math.floor(Math.log2(nodes.length - 1 < 0 ? 0 : nodes.length - 1)) + 1), [nodes.length]);
  const height = depth * levelHeight + 30;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 340 }}>
      {nodes.map((node) => {
        const from = positions.get(node.index);
        if (!from) return null;
        return [node.left, node.right]
          .filter((child): child is number => child !== null && child < nodes.length)
          .map((child) => {
            const to = positions.get(child);
            if (!to) return null;
            return (
              <line
                key={`${node.index}-${child}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="#334155"
                strokeWidth={1.5}
              />
            );
          });
      })}
      {nodes.map((node) => {
        const position = positions.get(node.index);
        if (!position) return null;
        const color = PRIORITY_COLORS[node.priority] ?? "#38bdf8";
        const isRoot = node.index === 0;
        const isHighlighted = highlight.has(node.index);
        return (
          <g key={node.index} transform={`translate(${position.x},${position.y})`}>
            <circle
              r={22}
              fill={`${color}22`}
              stroke={isHighlighted ? "#fbbf24" : isRoot ? "#22d3ee" : color}
              strokeWidth={isHighlighted || isRoot ? 3 : 2}
            />
            <text textAnchor="middle" y={-2} fontSize={11} fill="#e2e8f0" fontFamily="monospace">
              P{node.priority}
            </text>
            <text textAnchor="middle" y={11} fontSize={9} fill="#94a3b8" fontFamily="monospace">
              [{node.index}]
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function BufferInspector() {
  const { sessions, activeSession } = useCapture();
  const simulation = useSimulation();
  const { state } = simulation;
  const [selected, setSelected] = useState<PacketMetadata | null>(null);

  const [sessionId, setSessionId] = useState("");
  const [policy, setPolicy] = useState<"fifo" | "priority">("fifo");
  const [capacity, setCapacity] = useState(32);
  const [serviceRate, setServiceRate] = useState(200);
  const [window, setWindow] = useState(200);

  const sessionOptions = useMemo(
    () => sessions.filter((session) => session.retained_packets > 0),
    [sessions],
  );

  useEffect(() => {
    if (!sessionId && sessionOptions.length > 0) setSessionId(sessionOptions[0].session_id);
  }, [sessionId, sessionOptions]);

  useEffect(() => {
    void simulation.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadInspection = useCallback(() => {
    void simulation.start({
      policy,
      capacity,
      service_rate: serviceRate,
      time_scale: 0,
      window,
      session_id: sessionId || null,
      label: "buffer-inspection",
    });
  }, [capacity, policy, serviceRate, sessionId, simulation, window]);

  const queue = state?.queue ?? null;

  const highlight = useMemo(() => {
    const set = new Set<number>();
    if (!queue) return set;
    const recent = queue.trace.slice(-4);
    recent.forEach((entry) => {
      if (entry.index !== null && entry.index !== undefined) set.add(entry.index);
      if (entry.slot !== null && entry.slot !== undefined) set.add(entry.slot);
    });
    return set;
  }, [queue]);

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Inspection target">
        The inspector visualises the buffer of a live or most recent simulation run. It never inspects the operating
        system's real packet buffers.
      </Alert>

      <Card title="Inspection setup" subtitle="Choose captured traffic and a policy to inspect">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <Field label="Capture session">
            <select className="input" value={sessionId} onChange={(event) => setSessionId(event.target.value)}>
              <option value="">{sessionOptions.length ? "Select a session" : "No captured sessions"}</option>
              {sessionOptions.map((session) => (
                <option key={session.session_id} value={session.session_id}>
                  {session.session_id} · {session.retained_packets} pkts
                </option>
              ))}
            </select>
          </Field>
          <Field label="Policy">
            <select className="input" value={policy} onChange={(event) => setPolicy(event.target.value as "fifo" | "priority")}>
              <option value="fifo">Circular queue</option>
              <option value="priority">Min-heap</option>
            </select>
          </Field>
          <Field label="Capacity">
            <input type="number" className="input" min={2} max={4096} value={capacity} onChange={(event) => setCapacity(Number(event.target.value))} />
          </Field>
          <Field label="Processing rate (pkt/s)">
            <input type="number" className="input" min={0.1} value={serviceRate} onChange={(event) => setServiceRate(Number(event.target.value))} />
          </Field>
          <div className="flex items-end gap-2">
            <Field label="Window (packets)">
              <input type="number" className="input" min={1} max={50000} value={window} onChange={(event) => setWindow(Number(event.target.value))} />
            </Field>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" onClick={loadInspection} disabled={!sessionId || simulation.busy}>
            <RotateCw size={14} /> Load inspection run
          </button>
          <button type="button" className="btn-ghost" onClick={() => void simulation.pause()} disabled={!state || state.paused}>
            Pause
          </button>
          <button type="button" className="btn-ghost" onClick={() => void simulation.step()} disabled={!state}>
            Step
          </button>
          <button type="button" className="btn-ghost" onClick={() => void simulation.resume()} disabled={!state || !state.paused}>
            Resume
          </button>
          {simulation.error && <span className="text-xs text-rose-400">{simulation.error}</span>}
        </div>
      </Card>

      {!state || !queue ? (
        <EmptyState
          icon={<Boxes size={30} />}
          title="No buffer to inspect"
          description="Capture some traffic and load an inspection run, or start a simulation on the Router Simulation page."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Policy" value={state.config.policy === "fifo" ? "Circular queue" : "Min-heap"} />
            <MetricCard label="Size / capacity" value={`${formatNumber(queue.size)} / ${formatNumber(queue.capacity)}`} tone="accent" />
            <MetricCard label="Peak occupancy" value={formatNumber(state.metrics.peak_buffer_occupancy)} hint={`${formatNumber(state.metrics.peak_buffer_utilization_percent, 1)}% utilization`} />
            <MetricCard label="Simulated drops" value={formatNumber(state.metrics.dropped_packets)} tone="danger" />
            <MetricCard label="Average occupancy" value={formatNumber(state.metrics.average_buffer_occupancy, 2)} />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <div className="space-y-4">
              {queue.type === "circular_queue" ? (
                <Card
                  title="Circular queue — array cells"
                  subtitle={`front index ${queue.front} · rear index ${queue.rear} · modular indexing (index + 1) % ${queue.capacity}`}
                >
                  <div className="flex flex-wrap gap-2">
                    {queue.buffer?.map((cell) => {
                      const roleColor =
                        cell.role === "front" || cell.role === "front_rear"
                          ? "border-accent text-accent"
                          : cell.role === "rear"
                            ? "border-amber-400 text-amber-300"
                            : cell.item
                              ? "border-surface-600 text-slate-200"
                              : "border-surface-700 text-slate-600";
                      const role = cell.role === "front_rear" ? "F/R" : cell.role === "front" ? "F" : cell.role === "rear" ? "R" : "";
                      return (
                        <button
                          key={cell.index}
                          type="button"
                          onClick={() => cell.item && setSelected(cell.item)}
                          className={`relative h-20 w-20 rounded-lg border-2 bg-surface-850 p-1 text-left text-[10px] transition-colors hover:border-accent ${roleColor} ${
                            highlight.has(cell.index) ? "ring-2 ring-amber-400/70" : ""
                          }`}
                        >
                          <span className="absolute left-1 top-0.5 font-mono text-[10px] text-slate-500">{cell.index}</span>
                          {role && <span className="absolute right-1 top-0.5 font-mono text-[10px]">{role}</span>}
                          {cell.item ? (
                            <span className="mt-4 block truncate font-mono text-[10px] text-slate-300">
                              {cell.item.protocol}
                              <br />
                              {cell.item.length}B
                            </span>
                          ) : (
                            <span className="mt-4 block text-center text-slate-600">empty</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Logical FIFO order</h3>
                      <ol className="space-y-1 text-xs">
                        {(queue.contents ?? []).map((packet, index) => (
                          <li key={`${packet.event_id}-${index}`}>
                            <button
                              type="button"
                              className="w-full truncate rounded border border-surface-700/70 bg-surface-850 px-2 py-1 text-left font-mono text-slate-300 hover:border-accent"
                              onClick={() => setSelected(packet)}
                            >
                              {index + 1}. {packet.src_ip ?? "—"}:{packet.src_port ?? "—"} → {packet.dst_ip ?? "—"}:{packet.dst_port ?? "—"}
                            </button>
                          </li>
                        ))}
                        {(queue.contents ?? []).length === 0 && <li className="text-slate-500">Empty</li>}
                      </ol>
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Operation trace</h3>
                      <ul className="space-y-1 font-mono text-[11px]">
                        {[...queue.trace].reverse().slice(0, 12).map((entry, index) => (
                          <li key={index} className="flex items-center gap-2 border-b border-surface-800/60 py-0.5">
                            <span
                              className={
                                entry.op === "overflow"
                                  ? "text-rose-400"
                                  : entry.op === "enqueue"
                                    ? "text-emerald-400"
                                    : entry.op === "dequeue"
                                      ? "text-amber-300"
                                      : "text-slate-400"
                              }
                            >
                              {entry.op}
                            </span>
                            <span className="text-slate-500">
                              slot {entry.slot ?? entry.index ?? "—"} · size {entry.size}
                            </span>
                          </li>
                        ))}
                        {queue.trace.length === 0 && <li className="text-slate-500">No operations yet</li>}
                      </ul>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                    {Object.entries(queue.counters).map(([key, value]) => (
                      <div key={key} className="rounded border border-surface-700/70 bg-surface-850 px-2 py-1">
                        <p className="text-slate-500">{key}</p>
                        <p className="text-slate-100">{formatNumber(value)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              ) : (
                <Card title="Priority queue — binary min-heap" subtitle="Parent-child links · lower priority number scheduled first">
                  <HeapTree nodes={queue.nodes ?? []} highlight={highlight} />
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Extraction order</h3>
                      <ol className="space-y-1 text-xs">
                        {(queue.priority_order ?? []).map((packet, index) => (
                          <li key={`${packet.event_id}-${index}`}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between rounded border border-surface-700/70 bg-surface-850 px-2 py-1 text-left hover:border-accent"
                              onClick={() => setSelected(packet)}
                            >
                              <span className="truncate font-mono text-slate-300">
                                {index + 1}. {packet.src_ip ?? "—"}:{packet.src_port ?? "—"} → {packet.dst_ip ?? "—"}:{packet.dst_port ?? "—"}
                              </span>
                              <span
                                className="badge"
                                style={{ backgroundColor: `${PRIORITY_COLORS[packet.priority]}22`, color: PRIORITY_COLORS[packet.priority] }}
                              >
                                P{packet.priority}
                              </span>
                            </button>
                          </li>
                        ))}
                        {(queue.priority_order ?? []).length === 0 && <li className="text-slate-500">Heap is empty</li>}
                      </ol>
                    </div>
                    <div>
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Heap operations</h3>
                      <ul className="space-y-1 font-mono text-[11px]">
                        {[...queue.trace].reverse().slice(0, 12).map((entry, index) => (
                          <li key={index} className="flex items-center gap-2 border-b border-surface-800/60 py-0.5">
                            <span
                              className={
                                entry.op === "overflow"
                                  ? "text-rose-400"
                                  : entry.op === "insert"
                                    ? "text-emerald-400"
                                    : entry.op === "extract"
                                      ? "text-amber-300"
                                      : "text-slate-400"
                              }
                            >
                              {entry.op}
                            </span>
                            <span className="text-slate-500">
                              idx {entry.index ?? "—"} {entry.priority !== undefined ? `· P${entry.priority}` : ""} · size {entry.size}
                            </span>
                          </li>
                        ))}
                        {queue.trace.length === 0 && <li className="text-slate-500">No operations yet</li>}
                      </ul>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                    {Object.entries(queue.counters).map(([key, value]) => (
                      <div key={key} className="rounded border border-surface-700/70 bg-surface-850 px-2 py-1">
                        <p className="text-slate-500">{key}</p>
                        <p className="text-slate-100">{formatNumber(value)}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <Card title="Time complexity of the inspected operations">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500">
                      <th className="py-1">Operation</th>
                      <th className="py-1">Complexity</th>
                      <th className="py-1">Implementation</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono text-slate-300">
                    {queue.type === "circular_queue" ? (
                      <>
                        <tr className="border-t border-surface-800"><td className="py-1">enqueue</td><td>{queue.complexity.enqueue}</td><td className="text-slate-500">array rear index, modular</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">dequeue</td><td>{queue.complexity.dequeue}</td><td className="text-slate-500">array front index, modular</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">peek</td><td>{queue.complexity.peek}</td><td className="text-slate-500">front slot read</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">overflow</td><td>O(1)</td><td className="text-slate-500">drop-tail upon full buffer</td></tr>
                      </>
                    ) : (
                      <>
                        <tr className="border-t border-surface-800"><td className="py-1">insert</td><td>{queue.complexity.insert}</td><td className="text-slate-500">append + sift-up</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">extract_min</td><td>{queue.complexity.extract_min}</td><td className="text-slate-500">root swap + sift-down</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">peek</td><td>{queue.complexity.peek}</td><td className="text-slate-500">root read</td></tr>
                        <tr className="border-t border-surface-800"><td className="py-1">overflow</td><td>O(1)</td><td className="text-slate-500">drop-tail upon full heap</td></tr>
                      </>
                    )}
                  </tbody>
                </table>
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="Current packet in service" subtitle="Head-of-line packet being processed">
                {state.current_packet ? (
                  <PacketDetail packet={state.current_packet} />
                ) : (
                  <p className="px-3 py-4 text-xs text-slate-500">Server idle.</p>
                )}
              </Card>
              <Card title="Selected packet">
                <div className="max-h-[420px] overflow-auto">
                  <PacketDetail packet={selected} />
                </div>
              </Card>
            </div>
          </div>

          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Network size={12} /> {activeSession ? `Active capture: ${activeSession.interface_name}. ` : ""}
            <Layers size={12} /> Buffer visuals reflect the simulated router, not kernel or NIC memory.
          </p>
        </>
      )}
    </div>
  );
}
