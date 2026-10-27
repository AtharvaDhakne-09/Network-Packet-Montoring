import { useCallback, useMemo, useState } from "react";
import { Filter, Play, RefreshCw, Square, ShieldCheck, Wifi } from "lucide-react";
import { useCapture } from "../hooks/useCapture";
import { StatusPill, Alert, Spinner } from "./ui";
import { formatNumber } from "../lib/format";

export default function CaptureControls({ compact = false }: { compact?: boolean }) {
  const {
    interfaces,
    interfacesLoading,
    interfacesError,
    loadInterfaces,
    activeSession,
    status,
    metrics,
    socketState,
    startCapture,
    stopCapture,
    applyFilter,
    error,
    notice,
    clearError,
    clearNotice,
    settings,
  } = useCapture();

  const recommended = useMemo(
    () => interfaces.find((iface) => iface.recommended) ?? interfaces[0],
    [interfaces],
  );
  const [interfaceId, setInterfaceId] = useState<string>("");
  const [filter, setFilter] = useState<string>("");
  const [showFilter, setShowFilter] = useState(false);
  const [busy, setBusy] = useState(false);

  const selectedId = interfaceId || activeSession?.interface_id || recommended?.id || "";
  const live = status.state === "running" || status.state === "starting";
  const stateLabel = status.state === "idle" ? undefined : undefined;

  const handleStart = useCallback(async () => {
    if (!selectedId) return;
    setBusy(true);
    await startCapture({
      interfaceId: selectedId,
      filter,
      priorityRules: settings?.priority_rules ?? [],
    });
    setBusy(false);
  }, [filter, selectedId, settings?.priority_rules, startCapture]);

  const handleStop = useCallback(async () => {
    setBusy(true);
    await stopCapture();
    setBusy(false);
  }, [stopCapture]);

  const applyFilterClick = useCallback(async () => {
    setBusy(true);
    await applyFilter(filter);
    setBusy(false);
  }, [applyFilter, filter]);

  const tcp = metrics?.tcp_count ?? 0;
  const udp = metrics?.udp_count ?? 0;
  const icmp = metrics?.icmp_count ?? 0;

  return (
    <div className={`flex flex-col gap-2 ${compact ? "" : "mb-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill state={status.state} label={stateLabel} />

        <div className="relative">
          <Wifi size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <select
            className="input w-56 !pl-7"
            value={selectedId}
            disabled={live}
            onChange={(event) => setInterfaceId(event.target.value)}
          >
            <option value="">
              {interfacesLoading ? "Loading interfaces…" : "Select an interface"}
            </option>
            {interfaces.map((iface) => (
              <option key={iface.id} value={iface.id}>
                {iface.name}
                {iface.recommended ? " (recommended)" : ""}
                {iface.ipv4.length ? ` — ${iface.ipv4[0]}` : ""}
              </option>
            ))}
          </select>
        </div>

        <button type="button" className="btn-ghost" onClick={() => void loadInterfaces()} title="Refresh interfaces">
          <RefreshCw size={14} className={interfacesLoading ? "animate-spin" : ""} />
        </button>

        <button
          type="button"
          className="btn-ghost"
          onClick={() => setShowFilter((value) => !value)}
          title="Capture filter"
        >
          <Filter size={14} />
          {filter ? "Filter active" : "Filter"}
        </button>

        {live ? (
          <button type="button" className="btn-danger" disabled={busy} onClick={() => void handleStop()}>
            <Square size={14} /> Stop capture
          </button>
        ) : (
          <button
            type="button"
            className="btn-primary"
            disabled={busy || !selectedId || status.state === "stopping"}
            onClick={() => void handleStart()}
          >
            <Play size={14} /> Start capture
          </button>
        )}
        {busy && <Spinner />}
      </div>

      {showFilter && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-md font-mono"
            placeholder='Optional BPF filter, e.g. "tcp port 443" or "ip6"'
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <button type="button" className="btn-ghost" disabled={!live || busy} onClick={() => void applyFilterClick()}>
            Apply filter
          </button>
          <span className="text-xs text-slate-500">
            Filters use libpcap/Npcap syntax and are validated before being applied.
          </span>
        </div>
      )}

      {activeSession && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <span>
            Interface <span className="text-slate-200">{activeSession.interface_name}</span>
          </span>
          <span>Captured {formatNumber(activeSession.packets_delivered)}</span>
          <span>Displayed {formatNumber(activeSession.streamed_packets)}</span>
          <span>
            Rate {formatNumber(metrics?.packets_per_second ?? 0, 1)} pkt/s · {formatNumber(metrics?.bytes_per_second ?? 0, 0)} B/s
          </span>
          <span>
            TCP {formatNumber(tcp)} · UDP {formatNumber(udp)} · ICMP {formatNumber(icmp)}
          </span>
          <span className={socketState === "connected" ? "text-emerald-400" : "text-amber-400"}>
            Stream {socketState}
          </span>
        </div>
      )}

      {interfacesError && (
        <Alert tone="error" title="Interface discovery failed" onClose={clearError}>
          {interfacesError}
        </Alert>
      )}
      {!interfacesError && !interfacesLoading && interfaces.length === 0 && (
        <Alert tone="warning" title="No capture interfaces found">
          Npcap may be missing or no adapter is available. Install Npcap from npcap.com, then refresh.
        </Alert>
      )}
      {error && (
        <Alert tone="error" title="Capture error" onClose={clearError}>
          {error}
        </Alert>
      )}
      {notice && <Alert tone="success" onClose={clearNotice}>{notice}</Alert>}
      {activeSession && (
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <ShieldCheck size={12} /> Privacy: only packet metadata is captured — no payloads, credentials or content are stored.
        </p>
      )}
    </div>
  );
}
