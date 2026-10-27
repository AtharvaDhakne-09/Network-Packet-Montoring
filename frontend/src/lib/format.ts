import type { PacketMetadata } from "../types";

export const PROTOCOL_COLORS: Record<string, string> = {
  TCP: "#22d3ee",
  UDP: "#a78bfa",
  ICMP: "#f472b6",
  ICMPv6: "#fb7185",
  ARP: "#facc15",
  IGMP: "#34d399",
  "Non-IP": "#94a3b8",
  Other: "#64748b",
};

export function protocolColor(protocol: string): string {
  return PROTOCOL_COLORS[protocol] ?? "#38bdf8";
}

export const PRIORITY_COLORS: Record<number, string> = {
  1: "#f87171",
  2: "#fb923c",
  3: "#38bdf8",
  4: "#94a3b8",
};

export const PRIORITY_LABELS: Record<number, string> = {
  1: "Critical",
  2: "High",
  3: "Normal",
  4: "Low",
};

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(2)} ${units[unit]}`;
}

export function formatBytesPerSecond(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return "—";
  return `${formatBytes(bytes)}/s`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatMs(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return "—";
  return `${(seconds * 1000).toFixed(3)} ms`;
}

export function formatTimestamp(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("en-GB", { hour12: false }) + "." + String(date.getMilliseconds()).padStart(3, "0");
}

export function formatDateTime(timestamp: number | null | undefined): string {
  if (!timestamp) return "—";
  return new Date(timestamp * 1000).toLocaleString();
}

export function shortenFlow(flowId: string | null): string {
  if (!flowId) return "—";
  return flowId;
}

export function packetLabel(packet: PacketMetadata): string {
  const src = packet.src_ip ? `${packet.src_ip}${packet.src_port ? ":" + packet.src_port : ""}` : "—";
  const dst = packet.dst_ip ? `${packet.dst_ip}${packet.dst_port ? ":" + packet.dst_port : ""}` : "—";
  return `${src} → ${dst} (${packet.protocol})`;
}
