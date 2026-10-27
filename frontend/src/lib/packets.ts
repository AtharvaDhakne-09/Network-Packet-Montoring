import type { PacketMetadata } from "../types";

export interface PacketFilterState {
  search: string;
  protocol: string;
  ip: string;
  port: string;
}

export const EMPTY_FILTERS: PacketFilterState = { search: "", protocol: "", ip: "", port: "" };

export type SortKey = "timestamp" | "length" | "protocol" | "src_ip" | "dst_ip" | "src_port" | "dst_port";

export function filterPackets(packets: PacketMetadata[], filters: PacketFilterState): PacketMetadata[] {
  const search = filters.search.trim().toLowerCase();
  const protocol = filters.protocol.trim().toLowerCase();
  const ip = filters.ip.trim().toLowerCase();
  const port = filters.port.trim();

  return packets.filter((packet) => {
    if (protocol && packet.protocol.toLowerCase() !== protocol) return false;
    if (search) {
      const haystack = [
        packet.event_id,
        packet.src_ip ?? "",
        packet.dst_ip ?? "",
        packet.protocol,
        packet.classification,
        packet.flow_id ?? "",
        packet.src_port?.toString() ?? "",
        packet.dst_port?.toString() ?? "",
        packet.tcp_flags ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (ip) {
      const src = (packet.src_ip ?? "").toLowerCase();
      const dst = (packet.dst_ip ?? "").toLowerCase();
      if (!src.includes(ip) && !dst.includes(ip)) return false;
    }
    if (port) {
      if (packet.src_port?.toString() !== port && packet.dst_port?.toString() !== port) return false;
    }
    return true;
  });
}

export function sortPackets(packets: PacketMetadata[], key: SortKey, direction: "asc" | "desc"): PacketMetadata[] {
  const factor = direction === "asc" ? 1 : -1;
  const value = (packet: PacketMetadata): number | string => {
    switch (key) {
      case "timestamp":
        return packet.timestamp;
      case "length":
        return packet.length;
      case "protocol":
        return packet.protocol;
      case "src_ip":
        return packet.src_ip ?? "";
      case "dst_ip":
        return packet.dst_ip ?? "";
      case "src_port":
        return packet.src_port ?? -1;
      case "dst_port":
        return packet.dst_port ?? -1;
      default:
        return packet.timestamp;
    }
  };
  return [...packets].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    if (typeof left === "string" || typeof right === "string") {
      return String(left).localeCompare(String(right)) * factor;
    }
    return (left - right) * factor;
  });
}

export function mergePackets(
  existing: PacketMetadata[],
  incoming: PacketMetadata[],
  capacity = 5000,
): PacketMetadata[] {
  if (incoming.length === 0) return existing;
  const seen = new Set(existing.map((packet) => packet.event_id));
  const fresh = incoming.filter((packet) => !seen.has(packet.event_id));
  if (fresh.length === 0) return existing;
  const merged = [...fresh, ...existing];
  return merged.length > capacity ? merged.slice(0, capacity) : merged;
}

export function packetsToCsvRows(packets: PacketMetadata[]): string[][] {
  const header = [
    "event_id",
    "timestamp",
    "src_ip",
    "src_port",
    "dst_ip",
    "dst_port",
    "protocol",
    "length",
    "ip_version",
    "tcp_flags",
    "interface",
    "direction",
    "classification",
    "flow_id",
  ];
  const rows = packets.map((packet) => [
    packet.event_id,
    new Date(packet.timestamp * 1000).toISOString(),
    packet.src_ip ?? "",
    packet.src_port?.toString() ?? "",
    packet.dst_ip ?? "",
    packet.dst_port?.toString() ?? "",
    packet.protocol,
    String(packet.length),
    packet.ip_version?.toString() ?? "",
    packet.tcp_flags ?? "",
    packet.interface,
    packet.direction ?? "",
    packet.classification,
    packet.flow_id ?? "",
  ]);
  return [header, ...rows];
}
