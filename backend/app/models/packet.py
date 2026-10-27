from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


class PacketPriority:
    CRITICAL = 1
    HIGH = 2
    NORMAL = 3
    LOW = 4

    LABELS = {
        1: "Critical",
        2: "High",
        3: "Normal",
        4: "Low",
    }


class PacketMetadata(BaseModel):
    model_config = ConfigDict(frozen=True)

    event_id: str
    session_id: str
    timestamp: float
    src_ip: str | None = None
    dst_ip: str | None = None
    src_port: int | None = None
    dst_port: int | None = None
    protocol: str
    length: int = Field(ge=0)
    ip_version: int | None = None
    tcp_flags: str | None = None
    interface: str
    direction: str | None = None
    classification: str = "Unclassified"
    flow_id: str | None = None
    priority: int = Field(default=PacketPriority.NORMAL, ge=1, le=4)
    priority_reason: str = "default classification"

    @property
    def timestamp_iso(self) -> str:
        return datetime.fromtimestamp(self.timestamp, tz=timezone.utc).isoformat()

    def to_row(self) -> dict:
        return self.model_dump(mode="json")
