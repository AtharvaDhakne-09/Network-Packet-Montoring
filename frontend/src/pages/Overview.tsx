import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Boxes, Clock, Database, Globe2, Layers, RadioTower, Waves, Zap } from "lucide-react";
import { useCapture } from "../hooks/useCapture";
import { Card, EmptyState, MetricCard, StatusPill } from "../components/ui";
import { formatBytes, formatBytesPerSecond, formatDuration, formatNumber, protocolColor } from "../lib/format";

const CHART_GRID = "#1e293b";
const AXIS_COLOR = "#64748b";

export default function Overview() {
  const { metrics, status, activeSession, settings } = useCapture();

  const series = useMemo(() => {
    if (!metrics) return [];
    return metrics.series.map((point) => ({
      time: new Date(point.time * 1000).toLocaleTimeString("en-GB", { hour12: false }),
      pps: point.packets,
      bps: point.bytes,
    }));
  }, [metrics]);

  const protocolData = useMemo(() => {
    if (!metrics) return [];
    return Object.entries(metrics.protocol_counts).map(([name, value]) => ({ name, value }));
  }, [metrics]);

  if (!activeSession && !metrics) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={<RadioTower size={32} />}
          title="No capture session yet"
          description={
            <>
              Select a Wi-Fi or Ethernet interface in the header and press <strong>Start capture</strong>. This dashboard
              reads real packets captured from that adapter — nothing is simulated. Live charts and counters will appear
              as soon as traffic is observed.
            </>
          }
        />
        <Card title="Interface visibility" subtitle="Understand what can and cannot be observed">
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-300">
            <li>An adapter only delivers frames it receives; unicast traffic for other hosts is usually not visible unless the NIC is in monitor/promiscuous mode.</li>
            <li>Wireless adapters typically deliver 802.11 traffic already translated to Ethernet frames by the driver.</li>
            <li>Loopback and VPN/tunnel adapters only show traffic on that virtual interface.</li>
            <li>Capture requires Npcap on Windows; permissions may be required depending on how Npcap was installed.</li>
          </ul>
        </Card>
      </div>
    );
  }

  const s = metrics;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <StatusPill state={status.state} />
        <span>
          Interface <span className="text-slate-200">{activeSession?.interface_name ?? "—"}</span>
        </span>
        {activeSession?.filter && (
          <span>
            Filter <span className="font-mono text-accent">{activeSession.filter}</span>
          </span>
        )}
        <span>Retained packets {formatNumber(activeSession?.retained_packets ?? 0)}</span>
        <span>Refresh {formatNumber((settings?.dashboard_refresh_ms ?? 1500) / 1000, 1)}s</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <MetricCard label="Total captured" value={formatNumber(s?.total_packets ?? 0)} icon={<Activity size={16} />} tone="accent" hint="Packets delivered to the app" />
        <MetricCard label="Packets / second" value={formatNumber(s?.packets_per_second ?? 0, 1)} icon={<Zap size={16} />} hint={`avg ${formatNumber(s?.avg_packets_per_second ?? 0, 1)} pkt/s`} />
        <MetricCard label="Total bytes" value={formatBytes(s?.total_bytes ?? 0)} icon={<Database size={16} />} hint={`${formatBytesPerSecond(s?.bytes_per_second ?? 0)}`} />
        <MetricCard label="Capture status" value={<StatusPill state={status.state} />} icon={<RadioTower size={16} />} hint={activeSession?.end_reason ?? "live"} />
        <MetricCard label="Duration" value={formatDuration(activeSession?.duration ?? 0)} icon={<Clock size={16} />} hint={activeSession?.started_at ? new Date(activeSession.started_at * 1000).toLocaleTimeString() : "—"} />
        <MetricCard label="TCP packets" value={formatNumber(s?.tcp_count ?? 0)} icon={<Layers size={16} />} />
        <MetricCard label="UDP packets" value={formatNumber(s?.udp_count ?? 0)} icon={<Waves size={16} />} />
        <MetricCard label="ICMP packets" value={formatNumber(s?.icmp_count ?? 0)} icon={<Boxes size={16} />} />
        <MetricCard label="Other protocols" value={formatNumber(s?.other_count ?? 0)} icon={<Layers size={16} />} />
        <MetricCard label="Unique IPs" value={formatNumber(s?.unique_ips ?? 0)} icon={<Globe2 size={16} />} hint={`${formatNumber(s?.unique_flows ?? 0)} observed flows`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Packets per second" subtitle="Grouped by capture second">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="ppsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#22d3ee" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={AXIS_COLOR} fontSize={11} minTickGap={24} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Area type="monotone" dataKey="pps" stroke="#22d3ee" fill="url(#ppsFill)" name="pkt/s" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Bytes per second" subtitle="Grouped by capture second">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="bpsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={AXIS_COLOR} fontSize={11} minTickGap={24} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} tickFormatter={(value) => formatBytes(value as number)} />
                <Tooltip
                  contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }}
                  formatter={(value) => formatBytes(value as number)}
                />
                <Area type="monotone" dataKey="bps" stroke="#a78bfa" fill="url(#bpsFill)" name="bytes/s" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Protocol distribution">
          <div className="h-56">
            {protocolData.length === 0 ? (
              <EmptyState title="No protocol data yet" description="Start capture to populate this chart." />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={protocolData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {protocolData.map((entry) => (
                      <Cell key={entry.name} fill={protocolColor(entry.name)} />
                    ))}
                  </Pie>
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card title="Packet-size distribution" subtitle="Frame length buckets (bytes)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.size_distribution ?? []}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke={AXIS_COLOR} fontSize={10} />
                <YAxis stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="count" fill="#38bdf8" name="packets" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top source addresses">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.top_sources ?? []} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis type="number" stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={AXIS_COLOR} fontSize={10} width={110} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="value" fill="#34d399" name="packets" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Top destination addresses">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s?.top_destinations ?? []} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={CHART_GRID} strokeDasharray="3 3" />
                <XAxis type="number" stroke={AXIS_COLOR} fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={AXIS_COLOR} fontSize={10} width={110} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="value" fill="#f472b6" name="packets" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Interface visibility limitations" subtitle="Reported honestly, not inferred">
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
          <ul className="list-disc space-y-1 pl-5">
            <li>Counts describe the selected adapter <span className="text-slate-100">{activeSession?.interface_name}</span> only.</li>
            <li>OS-level received/dropped counters: {activeSession?.os_stats_available ? `${formatNumber(activeSession.os_packets_received ?? 0)} received, ${formatNumber(activeSession.os_packets_dropped ?? 0)} dropped by the kernel` : "not exposed by this platform/driver"}.</li>
            <li>Application queue drops (bounded queue overflow): {formatNumber(activeSession?.app_queue_dropped ?? 0)}.</li>
          </ul>
          <ul className="list-disc space-y-1 pl-5">
            <li>Capture direction is only shown when the driver provides it reliably; otherwise it stays blank.</li>
            <li>Packet payloads are never stored or transmitted — only metadata.</li>
            <li>Protocol labels are based on headers and well-known ports, not deep packet inspection.</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
