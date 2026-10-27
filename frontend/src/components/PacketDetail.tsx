import type { PacketMetadata } from "../types";
import { formatDateTime, formatTimestamp, PRIORITY_LABELS, shortenFlow } from "../lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-700/50 px-3 py-1.5 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="text-right font-mono text-slate-200">{value ?? "—"}</span>
    </div>
  );
}

export default function PacketDetail({ packet }: { packet: PacketMetadata | null }) {
  if (!packet) {
    return <p className="px-3 py-6 text-center text-xs text-slate-500">Select a packet to inspect its metadata.</p>;
  }
  return (
    <div className="divide-y divide-surface-700/50">
      <Row label="Event ID" value={packet.event_id} />
      <Row label="Captured at" value={formatDateTime(packet.timestamp)} />
      <Row label="Relative" value={formatTimestamp(packet.timestamp)} />
      <Row label="Source" value={packet.src_ip ?? "—"} />
      <Row label="Source port" value={packet.src_port ?? "—"} />
      <Row label="Destination" value={packet.dst_ip ?? "—"} />
      <Row label="Destination port" value={packet.dst_port ?? "—"} />
      <Row label="Protocol" value={packet.protocol} />
      <Row label="Frame length" value={`${packet.length} bytes`} />
      <Row label="IP version" value={packet.ip_version ?? "—"} />
      <Row label="TCP flags" value={packet.tcp_flags ?? "—"} />
      <Row label="Interface" value={packet.interface} />
      <Row label="Direction" value={packet.direction ?? "unavailable"} />
      <Row label="Classification" value={packet.classification} />
      <Row label="Flow ID" value={shortenFlow(packet.flow_id)} />
      <Row label="Simulated priority" value={`${packet.priority} · ${PRIORITY_LABELS[packet.priority] ?? ""}`} />
      <Row label="Priority reason" value={packet.priority_reason} />
      <Row label="Session" value={packet.session_id} />
    </div>
  );
}
