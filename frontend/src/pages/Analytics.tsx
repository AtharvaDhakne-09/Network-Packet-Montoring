import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3 } from "lucide-react";
import { useCapture } from "../hooks/useCapture";
import { Card, EmptyState, MetricCard } from "../components/ui";
import { formatBytes, formatBytesPerSecond, formatNumber, protocolColor } from "../lib/format";

const GRID = "#1e293b";
const AXIS = "#64748b";
const RANGES = [30, 60, 180, 0];

export default function Analytics() {
  const { metrics, activeSession } = useCapture();
  const [range, setRange] = useState(60);

  const series = useMemo(() => {
    if (!metrics) return [];
    const points = range === 0 ? metrics.series : metrics.series.slice(-range);
    return points.map((point) => ({
      time: new Date(point.time * 1000).toLocaleTimeString("en-GB", { hour12: false }),
      packets: point.packets,
      bytes: point.bytes,
      tcp: point.tcp,
      udp: point.udp,
      icmp: point.icmp,
      other: point.other,
    }));
  }, [metrics, range]);

  const protocolData = useMemo(
    () => Object.entries(metrics?.protocol_counts ?? {}).map(([name, value]) => ({ name, value })),
    [metrics],
  );

  if (!metrics || metrics.total_packets === 0) {
    return (
      <EmptyState
        icon={<BarChart3 size={30} />}
        title="No analytics data yet"
        description="Analytics are derived from real captured packets. Start a capture session and browse some traffic, then return here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>Session {activeSession?.session_id ?? "—"}</span>
        <span>Interface {activeSession?.interface_name ?? "—"}</span>
        <span>Window</span>
        <select className="input w-40 !py-1" value={range} onChange={(event) => setRange(Number(event.target.value))}>
          {RANGES.map((value) => (
            <option key={value} value={value}>
              {value === 0 ? "Full session" : `Last ${value} seconds`}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Packets observed" value={formatNumber(metrics.total_packets)} />
        <MetricCard label="Bytes observed" value={formatBytes(metrics.total_bytes)} />
        <MetricCard label="Average rate" value={`${formatNumber(metrics.avg_packets_per_second, 2)} pkt/s`} hint={formatBytesPerSecond(metrics.avg_bytes_per_second)} />
        <MetricCard label="Unique flows" value={formatNumber(metrics.unique_flows)} hint={`${formatNumber(metrics.unique_ips)} unique IPs`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Packet rate" subtitle="Packets per capture second">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={AXIS} fontSize={11} minTickGap={24} />
                <YAxis stroke={AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Line type="monotone" dataKey="packets" stroke="#22d3ee" strokeWidth={2} dot={false} name="pkt/s" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Byte rate" subtitle="Bytes per capture second">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  <linearGradient id="analyticsBytes" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="time" stroke={AXIS} fontSize={11} minTickGap={24} />
                <YAxis stroke={AXIS} fontSize={11} tickFormatter={(value) => formatBytes(value as number)} />
                <Tooltip
                  contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }}
                  formatter={(value) => formatBytes(value as number)}
                />
                <Area type="monotone" dataKey="bytes" stroke="#a78bfa" fill="url(#analyticsBytes)" name="bytes/s" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Protocol distribution">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={protocolData}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke={AXIS} fontSize={10} />
                <YAxis stroke={AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="value" name="packets" radius={[3, 3, 0, 0]}>
                  {protocolData.map((entry) => (
                    <Cell key={entry.name} fill={protocolColor(entry.name)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Packet-size distribution" subtitle="Frame length (bytes)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.size_distribution}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" stroke={AXIS} fontSize={10} />
                <YAxis stroke={AXIS} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="count" fill="#38bdf8" name="packets" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Observed source addresses">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.top_sources} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis type="number" stroke={AXIS} fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={AXIS} fontSize={10} width={110} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="value" fill="#34d399" name="packets" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Observed destination addresses">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.top_destinations} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                <XAxis type="number" stroke={AXIS} fontSize={11} allowDecimals={false} />
                <YAxis type="category" dataKey="name" stroke={AXIS} fontSize={10} width={110} />
                <Tooltip contentStyle={{ background: "#0b1220", border: "1px solid #1e293b", fontSize: 12 }} />
                <Bar dataKey="value" fill="#f472b6" name="packets" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Busiest service ports" subtitle="Protocol / destination port">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Port</th>
                <th className="py-1 text-right">Packets</th>
              </tr>
            </thead>
            <tbody>
              {metrics.top_ports.map((row) => (
                <tr key={row.name} className="border-t border-surface-800">
                  <td className="py-1 font-mono text-slate-300">{row.name}</td>
                  <td className="py-1 text-right text-slate-200">{formatNumber(row.value)}</td>
                </tr>
              ))}
              {metrics.top_ports.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 text-center text-slate-500">
                    No ports observed
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card title="Observed flows" subtitle="Identifiable 5-tuples (hashed)">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="py-1">Flow ID</th>
                <th className="py-1 text-right">Packets</th>
              </tr>
            </thead>
            <tbody>
              {metrics.top_flows.map((row) => (
                <tr key={row.name} className="border-t border-surface-800">
                  <td className="py-1 font-mono text-slate-300">{row.name}</td>
                  <td className="py-1 text-right text-slate-200">{formatNumber(row.value)}</td>
                </tr>
              ))}
              {metrics.top_flows.length === 0 && (
                <tr>
                  <td colSpan={2} className="py-2 text-center text-slate-500">
                    No identifiable flows
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>
    </div>
  );
}
