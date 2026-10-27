from __future__ import annotations

import threading
import time
from collections import Counter, deque
from typing import Any

from ..models.packet import PacketMetadata

SIZE_BUCKETS = [0, 64, 128, 256, 512, 1024, 1280, 1518, 9000, 10**9]
SIZE_LABELS = ["<64", "64-127", "128-255", "256-511", "512-1023", "1024-1279", "1280-1517", "1518-8999", "9000+"]


class MetricsCollector:
    def __init__(self, window_seconds: int = 900) -> None:
        self._lock = threading.Lock()
        self._window = window_seconds
        self._reset_locked()

    def _reset_locked(self) -> None:
        self._buckets: dict[int, dict[str, Any]] = {}
        self._bucket_order: deque[int] = deque()
        self.total_packets = 0
        self.total_bytes = 0
        self.protocol_counts: Counter[str] = Counter()
        self.size_counts: Counter[str] = Counter()
        self.src_counts: Counter[str] = Counter()
        self.dst_counts: Counter[str] = Counter()
        self.port_counts: Counter[str] = Counter()
        self.flow_counts: Counter[str] = Counter()
        self.unique_ips: set[str] = set()
        self.unique_flows: set[str] = set()
        self.first_timestamp: float | None = None
        self.last_timestamp: float | None = None
        self.tcp_count = 0
        self.udp_count = 0
        self.icmp_count = 0
        self.other_count = 0

    def reset(self) -> None:
        with self._lock:
            self._reset_locked()

    def record(self, packet: PacketMetadata) -> None:
        with self._lock:
            bucket_key = int(packet.timestamp)
            bucket = self._buckets.get(bucket_key)
            if bucket is None:
                bucket = {"second": bucket_key, "packets": 0, "bytes": 0, "tcp": 0, "udp": 0, "icmp": 0, "other": 0}
                self._buckets[bucket_key] = bucket
                self._bucket_order.append(bucket_key)
                while len(self._bucket_order) > self._window:
                    old = self._bucket_order.popleft()
                    self._buckets.pop(old, None)

            bucket["packets"] += 1
            bucket["bytes"] += packet.length
            self.total_packets += 1
            self.total_bytes += packet.length
            self.protocol_counts[packet.protocol] += 1
            self.size_counts[self._size_label(packet.length)] += 1

            if packet.protocol == "TCP":
                self.tcp_count += 1
                bucket["tcp"] += 1
            elif packet.protocol == "UDP":
                self.udp_count += 1
                bucket["udp"] += 1
            elif packet.protocol in ("ICMP", "ICMPv6"):
                self.icmp_count += 1
                bucket["icmp"] += 1
            else:
                self.other_count += 1
                bucket["other"] += 1

            if packet.src_ip:
                self.src_counts[packet.src_ip] += 1
                self.unique_ips.add(packet.src_ip)
            if packet.dst_ip:
                self.dst_counts[packet.dst_ip] += 1
                self.unique_ips.add(packet.dst_ip)
            if packet.dst_port is not None:
                self.port_counts[f"{packet.protocol}/{packet.dst_port}"] += 1
            if packet.flow_id:
                self.flow_counts[packet.flow_id] += 1
                self.unique_flows.add(packet.flow_id)

            if self.first_timestamp is None or packet.timestamp < self.first_timestamp:
                self.first_timestamp = packet.timestamp
            if self.last_timestamp is None or packet.timestamp > self.last_timestamp:
                self.last_timestamp = packet.timestamp

    @staticmethod
    def _size_label(length: int) -> str:
        for i in range(len(SIZE_BUCKETS) - 1):
            if SIZE_BUCKETS[i] <= length < SIZE_BUCKETS[i + 1]:
                return SIZE_LABELS[i]
        return SIZE_LABELS[-1]

    def current_rates(self) -> tuple[float, float]:
        now = time.time()
        pps = 0
        bps = 0
        with self._lock:
            for bucket in self._buckets.values():
                delta = now - bucket["second"]
                if delta <= 1.0:
                    pps += bucket["packets"]
                    bps += bucket["bytes"]
        return float(pps), float(bps)

    def snapshot(self, series_limit: int = 300, top_limit: int = 8) -> dict:
        pps, bps = self.current_rates()
        with self._lock:
            buckets = sorted(self._buckets.values(), key=lambda b: b["second"])
            if series_limit:
                buckets = buckets[-series_limit:]
            duration = 0.0
            if self.first_timestamp is not None and self.last_timestamp is not None:
                duration = max(self.last_timestamp - self.first_timestamp, 0.0)
            avg_pps = self.total_packets / duration if duration > 0 else float(self.total_packets)
            avg_bps = self.total_bytes / duration if duration > 0 else float(self.total_bytes)
            return {
                "total_packets": self.total_packets,
                "total_bytes": self.total_bytes,
                "packets_per_second": pps,
                "bytes_per_second": bps,
                "avg_packets_per_second": round(avg_pps, 2),
                "avg_bytes_per_second": round(avg_bps, 2),
                "protocol_counts": dict(self.protocol_counts.most_common()),
                "size_distribution": [
                    {"bucket": label, "count": self.size_counts.get(label, 0)}
                    for label in SIZE_LABELS
                ],
                "tcp_count": self.tcp_count,
                "udp_count": self.udp_count,
                "icmp_count": self.icmp_count,
                "other_count": self.other_count,
                "unique_ips": len(self.unique_ips),
                "unique_flows": len(self.unique_flows),
                "top_sources": self._top(self.src_counts, top_limit),
                "top_destinations": self._top(self.dst_counts, top_limit),
                "top_ports": self._top(self.port_counts, top_limit),
                "top_flows": self._top(self.flow_counts, top_limit),
                "series": [
                    {
                        "second": b["second"],
                        "time": b["second"],
                        "packets": b["packets"],
                        "bytes": b["bytes"],
                        "tcp": b["tcp"],
                        "udp": b["udp"],
                        "icmp": b["icmp"],
                        "other": b["other"],
                    }
                    for b in buckets
                ],
                "first_timestamp": self.first_timestamp,
                "last_timestamp": self.last_timestamp,
            }

    @staticmethod
    def _top(counter: Counter[str], limit: int) -> list[dict]:
        return [{"name": name, "value": value} for name, value in counter.most_common(limit)]
