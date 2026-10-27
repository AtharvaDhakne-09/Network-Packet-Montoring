from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from ..analytics.metrics import MetricsCollector

from ..models.packet import PacketMetadata


@dataclass
class CaptureSession:
    session_id: str
    interface_id: str
    interface_name: str
    filter: str
    max_packets: int
    max_duration: float
    started_at: float
    priority_rules: list[Any] = field(default_factory=list)
    status: str = "starting"
    mode: str = "live"
    stopped_at: float | None = None
    error: str | None = None
    end_reason: str | None = None
    packets: list[PacketMetadata] = field(default_factory=list)
    packets_delivered: int = 0
    packets_ingested: int = 0
    packets_ignored: int = 0
    app_queue_dropped: int = 0
    streamed_packets: int = 0
    os_packets_received: int | None = None
    os_packets_dropped: int | None = None
    os_stats_available: bool = False
    metrics: MetricsCollector = field(default_factory=MetricsCollector)
    runtime: dict[str, Any] = field(default_factory=dict)

    def record(self, packet: PacketMetadata, max_history: int) -> None:
        self.packets.append(packet)
        self.packets_ingested += 1
        if len(self.packets) > max_history:
            del self.packets[: len(self.packets) - max_history]

    @property
    def duration(self) -> float:
        end = self.stopped_at if self.stopped_at is not None else _now()
        return max(end - self.started_at, 0.0)

    def to_dict(self) -> dict:
        return {
            "session_id": self.session_id,
            "interface_id": self.interface_id,
            "interface_name": self.interface_name,
            "filter": self.filter,
            "status": self.status,
            "mode": self.mode,
            "started_at": self.started_at,
            "stopped_at": self.stopped_at,
            "duration": round(self.duration, 3),
            "error": self.error,
            "end_reason": self.end_reason,
            "retained_packets": len(self.packets),
            "packets_delivered": self.packets_delivered,
            "packets_ingested": self.packets_ingested,
            "packets_ignored": self.packets_ignored,
            "app_queue_dropped": self.app_queue_dropped,
            "streamed_packets": self.streamed_packets,
            "os_packets_received": self.os_packets_received,
            "os_packets_dropped": self.os_packets_dropped,
            "os_stats_available": self.os_stats_available,
            "max_packets": self.max_packets,
            "max_duration": self.max_duration,
        }

    def is_live(self) -> bool:
        return self.status in ("starting", "running", "stopping")


def _now() -> float:
    import time

    return time.time()
