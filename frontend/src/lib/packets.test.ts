import { describe, expect, it } from "vitest";
import {
  EMPTY_FILTERS,
  filterPackets,
  mergePackets,
  packetsToCsvRows,
  sortPackets,
} from "./packets";
import type { PacketMetadata } from "../types";

function packet(overrides: Partial<PacketMetadata> = {}): PacketMetadata {
  return {
    event_id: "e1",
    session_id: "s1",
    timestamp: 1000,
    src_ip: "10.0.0.1",
    dst_ip: "10.0.0.2",
    src_port: 12345,
    dst_port: 443,
    protocol: "TCP",
    length: 100,
    ip_version: 4,
    tcp_flags: "ACK",
    interface: "Wi-Fi",
    direction: null,
    classification: "HTTPS/TLS",
    flow_id: "tcp-abc",
    priority: 3,
    priority_reason: "default",
    ...overrides,
  };
}

describe("filterPackets", () => {
  const packets = [
    packet({ event_id: "a", protocol: "TCP", dst_port: 443 }),
    packet({ event_id: "b", protocol: "UDP", dst_port: 53, src_ip: "10.0.0.9" }),
    packet({ event_id: "c", protocol: "ICMP", dst_port: null, src_port: null, flow_id: null }),
  ];

  it("returns everything with empty filters", () => {
    expect(filterPackets(packets, EMPTY_FILTERS)).toHaveLength(3);
  });

  it("filters by protocol", () => {
    expect(filterPackets(packets, { ...EMPTY_FILTERS, protocol: "udp" })).toHaveLength(1);
  });

  it("filters by ip substring", () => {
    expect(filterPackets(packets, { ...EMPTY_FILTERS, ip: "10.0.0.9" })).toHaveLength(1);
  });

  it("filters by port", () => {
    expect(filterPackets(packets, { ...EMPTY_FILTERS, port: "53" })).toHaveLength(1);
  });

  it("filters by search across fields", () => {
    expect(filterPackets(packets, { ...EMPTY_FILTERS, search: "icmp" })).toHaveLength(1);
  });
});

describe("sortPackets", () => {
  const packets = [
    packet({ event_id: "a", timestamp: 100, length: 300 }),
    packet({ event_id: "b", timestamp: 300, length: 100 }),
    packet({ event_id: "c", timestamp: 200, length: 200 }),
  ];

  it("sorts by timestamp descending", () => {
    expect(sortPackets(packets, "timestamp", "desc").map((p) => p.event_id)).toEqual(["b", "c", "a"]);
  });

  it("sorts by length ascending", () => {
    expect(sortPackets(packets, "length", "asc").map((p) => p.event_id)).toEqual(["b", "c", "a"]);
  });

  it("does not mutate the input", () => {
    const original = [...packets];
    sortPackets(packets, "length", "asc");
    expect(packets).toEqual(original);
  });
});

describe("mergePackets", () => {
  it("prepends new packets and drops duplicates", () => {
    const existing = [packet({ event_id: "a" })];
    const incoming = [packet({ event_id: "b" }), packet({ event_id: "a" })];
    const merged = mergePackets(existing, incoming, 10);
    expect(merged.map((p) => p.event_id)).toEqual(["b", "a"]);
  });

  it("respects the bounded capacity", () => {
    const existing = Array.from({ length: 5 }, (_, i) => packet({ event_id: `e${i}` }));
    const merged = mergePackets(existing, [packet({ event_id: "new" })], 3);
    expect(merged).toHaveLength(3);
    expect(merged[0].event_id).toBe("new");
  });

  it("returns the same reference when nothing is new", () => {
    const existing = [packet({ event_id: "a" })];
    expect(mergePackets(existing, [], 10)).toBe(existing);
  });
});

describe("packetsToCsvRows", () => {
  it("produces a header and one row per packet", () => {
    const rows = packetsToCsvRows([packet({ event_id: "a" }), packet({ event_id: "b" })]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain("event_id");
    expect(rows[1][0]).toBe("a");
  });

  it("never includes payload fields", () => {
    const rows = packetsToCsvRows([packet()]);
    const flattened = rows.flat().join(",");
    expect(flattened).not.toMatch(/payload/i);
  });
});
