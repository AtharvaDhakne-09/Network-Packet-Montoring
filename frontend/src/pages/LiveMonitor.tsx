import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ArrowDownUp,
  Download,
  Eraser,
  Search,
  ArrowDownToLine,
  X,
} from "lucide-react";
import { useCapture } from "../hooks/useCapture";
import { Card, EmptyState, StatusPill, Toggle } from "../components/ui";
import PacketDetail from "../components/PacketDetail";
import {
  EMPTY_FILTERS,
  filterPackets,
  packetsToCsvRows,
  sortPackets,
  type PacketFilterState,
  type SortKey,
} from "../lib/packets";
import { downloadCsv } from "../lib/csv";
import { formatNumber, formatTimestamp, protocolColor } from "../lib/format";
import type { PacketMetadata } from "../types";

const GRID = "grid grid-cols-[110px_120px_1fr_70px_1fr_70px_90px_70px_120px_110px]";

export default function LiveMonitor() {
  const { packets, metrics, status, activeSession, clearLocalPackets } = useCapture();
  const [filters, setFilters] = useState<PacketFilterState>(EMPTY_FILTERS);
  const [sortKey, setSortKey] = useState<SortKey>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [paused, setPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selected, setSelected] = useState<PacketMetadata | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const protocols = useMemo(() => {
    const set = new Set(packets.map((packet) => packet.protocol));
    return Array.from(set).sort();
  }, [packets]);

  const liveRows = useMemo(
    () => sortPackets(filterPackets(packets, filters), sortKey, sortDir),
    [packets, filters, sortKey, sortDir],
  );

  const [snapshot, setSnapshot] = useState<PacketMetadata[]>([]);
  useEffect(() => {
    if (!paused) setSnapshot(liveRows);
  }, [liveRows, paused]);

  const rows = paused ? snapshot : liveRows;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 34,
    overscan: 14,
  });

  useEffect(() => {
    if (autoScroll && !paused && rows.length > 0) {
      virtualizer.scrollToIndex(0, { align: "start" });
    }
  }, [rows.length, autoScroll, paused, virtualizer]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const exportCsv = () => {
    downloadCsv(`packets-${activeSession?.session_id ?? "capture"}.csv`, packetsToCsvRows(rows));
  };

  const handleClear = () => {
    clearLocalPackets();
    setSnapshot([]);
    setSelected(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <StatusPill state={status.state} />
        <span>Interface {activeSession?.interface_name ?? "—"}</span>
        <span>Captured {formatNumber(activeSession?.packets_delivered ?? 0)}</span>
        <span>Delivered {formatNumber(activeSession?.packets_ingested ?? 0)}</span>
        <span>Displayed in browser {formatNumber(packets.length)}</span>
        <span>Streamed {formatNumber(activeSession?.streamed_packets ?? 0)}</span>
        <span>Rate {formatNumber(metrics?.packets_per_second ?? 0, 1)} pkt/s</span>
      </div>

      <Card
        title="Live packet table"
        subtitle={`Bounded display buffer of ${formatNumber(packets.length)} packets · virtualized rows`}
        actions={
          <>
            <Toggle checked={paused} onChange={setPaused} label={paused ? "Paused" : "Live"} />
            <Toggle checked={autoScroll} onChange={setAutoScroll} label="Auto-scroll" />
            <button type="button" className="btn-ghost" onClick={handleClear} title="Clear displayed history">
              <Eraser size={14} />
            </button>
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={rows.length === 0}>
              <Download size={14} /> CSV
            </button>
          </>
        }
        bodyClassName="p-0"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-700/70 p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              className="input !pl-7"
              placeholder="Search by IP, port, protocol, classification, flow…"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
            />
          </div>
          <select
            className="input w-40"
            value={filters.protocol}
            onChange={(event) => setFilters((prev) => ({ ...prev, protocol: event.target.value }))}
          >
            <option value="">All protocols</option>
            {protocols.map((protocol) => (
              <option key={protocol} value={protocol}>
                {protocol}
              </option>
            ))}
          </select>
          <input
            className="input w-40"
            placeholder="IP filter"
            value={filters.ip}
            onChange={(event) => setFilters((prev) => ({ ...prev, ip: event.target.value }))}
          />
          <input
            className="input w-28"
            placeholder="Port"
            value={filters.port}
            onChange={(event) => setFilters((prev) => ({ ...prev, port: event.target.value.replace(/\D/g, "") }))}
          />
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setFilters(EMPTY_FILTERS)}
            disabled={JSON.stringify(filters) === JSON.stringify(EMPTY_FILTERS)}
          >
            <X size={14} /> Reset
          </button>
          <span className="text-xs text-slate-500">{formatNumber(rows.length)} rows</span>
        </div>

        <div className="grid gap-4 p-3 xl:grid-cols-[1fr_360px]">
          <div className="min-w-0">
            <div className={`${GRID} border-b border-surface-700/70 px-3 py-2 text-[11px] uppercase tracking-wide text-slate-500`}>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("timestamp")}>
                Time <ArrowDownUp size={10} />
              </button>
              <span>Event ID</span>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("src_ip")}>
                Source <ArrowDownUp size={10} />
              </button>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("src_port")}>
                Src port <ArrowDownUp size={10} />
              </button>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("dst_ip")}>
                Destination <ArrowDownUp size={10} />
              </button>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("dst_port")}>
                Dst port <ArrowDownUp size={10} />
              </button>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("protocol")}>
                Protocol <ArrowDownUp size={10} />
              </button>
              <button className="flex items-center gap-1 text-left" onClick={() => toggleSort("length")}>
                Length <ArrowDownUp size={10} />
              </button>
              <span>TCP flags</span>
              <span>Interface</span>
            </div>

            {rows.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={<ArrowDownToLine size={24} />}
                  title={paused ? "Display paused" : "No packets match the current filters"}
                  description={
                    status.state === "running"
                      ? "Waiting for packets on the selected interface…"
                      : "Start capture in the header to stream live packet metadata."
                  }
                />
              </div>
            ) : (
              <div ref={scrollRef} className="h-[520px] overflow-auto">
                <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                  {virtualizer.getVirtualItems().map((virtualRow) => {
                    const packet = rows[virtualRow.index];
                    const isSelected = selected?.event_id === packet.event_id;
                    return (
                      <div
                        key={packet.event_id}
                        className={`${GRID} absolute left-0 top-0 w-full cursor-pointer items-center border-b border-surface-800/60 px-3 text-xs ${
                          isSelected ? "bg-accent/10" : "hover:bg-surface-800/60"
                        }`}
                        style={{ height: virtualRow.size, transform: `translateY(${virtualRow.start}px)` }}
                        onClick={() => setSelected(packet)}
                      >
                        <span className="truncate font-mono text-slate-400">{formatTimestamp(packet.timestamp)}</span>
                        <span className="truncate font-mono text-slate-500">{packet.event_id.slice(0, 10)}</span>
                        <span className="truncate font-mono text-slate-200">{packet.src_ip ?? "—"}</span>
                        <span className="truncate font-mono text-slate-400">{packet.src_port ?? "—"}</span>
                        <span className="truncate font-mono text-slate-200">{packet.dst_ip ?? "—"}</span>
                        <span className="truncate font-mono text-slate-400">{packet.dst_port ?? "—"}</span>
                        <span className="truncate font-medium" style={{ color: protocolColor(packet.protocol) }}>
                          {packet.protocol}
                        </span>
                        <span className="truncate font-mono text-slate-300">{packet.length}</span>
                        <span className="truncate font-mono text-slate-400">{packet.tcp_flags ?? "—"}</span>
                        <span className="truncate text-slate-400">{packet.interface}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="card-header">
              <h3 className="text-sm font-semibold text-slate-100">Packet metadata</h3>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-200" onClick={() => setSelected(null)}>
                clear
              </button>
            </div>
            <div className="max-h-[520px] overflow-auto">
              <PacketDetail packet={selected} />
            </div>
          </div>
        </div>
      </Card>

      <p className="text-xs text-slate-500">
        This table renders metadata only. Raw frames and payload bytes never leave the backend, so credentials and message
        content are never displayed or exported.
      </p>
    </div>
  );
}
