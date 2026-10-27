import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Eraser, Search, X } from "lucide-react";
import { Alert, Card, EmptyState } from "../components/ui";
import PacketDetail from "../components/PacketDetail";
import { useCapture } from "../hooks/useCapture";
import { api } from "../services/api";
import { downloadCsv } from "../lib/csv";
import { packetsToCsvRows } from "../lib/packets";
import { formatDateTime, formatTimestamp, protocolColor } from "../lib/format";
import type { PacketMetadata, PacketQueryResult } from "../types";

export default function History() {
  const { sessions, activeSessionId, clearHistory } = useCapture();
  const [sessionId, setSessionId] = useState<string>("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [protocol, setProtocol] = useState("");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState("");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [sort, setSort] = useState("timestamp");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [result, setResult] = useState<PacketQueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PacketMetadata | null>(null);

  const sessionOptions = useMemo(
    () => sessions.filter((session) => session.retained_packets > 0 || session.session_id === activeSessionId),
    [sessions, activeSessionId],
  );

  const activeId = sessionId || activeSessionId || sessionOptions[0]?.session_id || "";

  const load = useCallback(async () => {
    if (!activeId) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await api.packets({
        session_id: activeId,
        q: search,
        protocol,
        ip,
        port: port ? Number(port) : undefined,
        since: since ? new Date(since).getTime() / 1000 : undefined,
        until: until ? new Date(until).getTime() / 1000 : undefined,
        sort,
        order,
        limit: pageSize,
        offset: page * pageSize,
      });
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeId, search, protocol, ip, port, since, until, sort, order, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / pageSize)) : 1;

  const exportCsv = () => {
    if (!result) return;
    downloadCsv(`history-${activeId}-page${page + 1}.csv`, packetsToCsvRows(result.packets));
  };

  const resetFilters = () => {
    setSearch("");
    setProtocol("");
    setIp("");
    setPort("");
    setSince("");
    setUntil("");
    setPage(0);
  };

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Captured packet history vs simulation history">
        This page lists retained <strong>captured packet metadata</strong> for the selected session. Simulation event
        history (offers, starts, completions, simulated drops) is separate and lives on the Router Simulation and Buffer
        Inspector pages.
      </Alert>

      <Card
        title="Retained packet history"
        subtitle={result ? `${result.total} matching packets · page ${page + 1} of ${totalPages}` : "Select a session"}
        actions={
          <>
            <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!result || result.packets.length === 0}>
              <Download size={14} /> Export page
            </button>
            <button
              type="button"
              className="btn-danger"
              disabled={!activeId}
              onClick={() => void clearHistory(activeId).then(() => load())}
            >
              <Eraser size={14} /> Clear history
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-surface-700/70 pb-3">
          <select className="input w-56" value={activeId} onChange={(event) => { setSessionId(event.target.value); setPage(0); }}>
            <option value="">{sessionOptions.length ? "Select a session" : "No captured sessions"}</option>
            {sessionOptions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.session_id} · {session.interface_name} · {session.retained_packets} pkts
              </option>
            ))}
          </select>
          <div className="relative min-w-[200px] flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className="input !pl-7" placeholder="Search…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
          </div>
          <input className="input w-32" placeholder="Protocol" value={protocol} onChange={(event) => { setProtocol(event.target.value); setPage(0); }} />
          <input className="input w-40" placeholder="IP" value={ip} onChange={(event) => { setIp(event.target.value); setPage(0); }} />
          <input className="input w-24" placeholder="Port" value={port} onChange={(event) => { setPort(event.target.value.replace(/\D/g, "")); setPage(0); }} />
          <input type="datetime-local" className="input w-52" value={since} onChange={(event) => { setSince(event.target.value); setPage(0); }} />
          <input type="datetime-local" className="input w-52" value={until} onChange={(event) => { setUntil(event.target.value); setPage(0); }} />
          <select className="input w-36" value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="timestamp">Timestamp</option>
            <option value="length">Length</option>
            <option value="protocol">Protocol</option>
            <option value="src_ip">Source IP</option>
            <option value="dst_ip">Destination IP</option>
          </select>
          <select className="input w-28" value={order} onChange={(event) => setOrder(event.target.value as "asc" | "desc")}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
          <button type="button" className="btn-ghost" onClick={resetFilters}>
            <X size={14} /> Reset
          </button>
        </div>

        {error && <Alert tone="error" title="History query failed">{error}</Alert>}

        <div className="mt-3 overflow-x-auto">
          {!result || result.packets.length === 0 ? (
            <EmptyState title={loading ? "Loading…" : "No packets match"} description="Adjust filters or capture more traffic." />
          ) : (
            <table className="w-full min-w-[720px] text-xs">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Time</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">S.port</th>
                  <th className="py-2">Destination</th>
                  <th className="py-2">D.port</th>
                  <th className="py-2">Protocol</th>
                  <th className="py-2">Length</th>
                  <th className="py-2">Flags</th>
                  <th className="py-2">Class</th>
                </tr>
              </thead>
              <tbody>
                {result.packets.map((packet) => (
                  <tr
                    key={packet.event_id}
                    className="cursor-pointer border-t border-surface-800 hover:bg-surface-800/60"
                    onClick={() => setSelected(packet)}
                  >
                    <td className="py-1.5 font-mono text-slate-400">{formatTimestamp(packet.timestamp)}</td>
                    <td className="py-1.5 font-mono text-slate-200">{packet.src_ip ?? "—"}</td>
                    <td className="py-1.5 font-mono text-slate-400">{packet.src_port ?? "—"}</td>
                    <td className="py-1.5 font-mono text-slate-200">{packet.dst_ip ?? "—"}</td>
                    <td className="py-1.5 font-mono text-slate-400">{packet.dst_port ?? "—"}</td>
                    <td className="py-1.5 font-medium" style={{ color: protocolColor(packet.protocol) }}>{packet.protocol}</td>
                    <td className="py-1.5 font-mono text-slate-300">{packet.length}</td>
                    <td className="py-1.5 font-mono text-slate-400">{packet.tcp_flags ?? "—"}</td>
                    <td className="py-1.5 text-slate-400">{packet.classification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <select
              className="input w-20 !py-1"
              value={pageSize}
              onChange={(event) => { setPageSize(Number(event.target.value)); setPage(0); }}
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span>Page {page + 1} of {totalPages}</span>
            <button type="button" className="btn-ghost" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>
              Prev
            </button>
            <button type="button" className="btn-ghost" disabled={page + 1 >= totalPages} onClick={() => setPage((value) => value + 1)}>
              Next
            </button>
          </div>
        </div>
      </Card>

      {selected && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-surface-700 bg-surface-900" onClick={(event) => event.stopPropagation()}>
            <div className="card-header">
              <div>
                <h3 className="text-sm font-semibold text-slate-100">Packet metadata</h3>
                <p className="text-xs text-slate-500">{formatDateTime(selected.timestamp)}</p>
              </div>
              <button type="button" className="text-xs text-slate-500 hover:text-slate-200" onClick={() => setSelected(null)}>
                close
              </button>
            </div>
            <div className="max-h-[70vh] overflow-auto">
              <PacketDetail packet={selected} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
