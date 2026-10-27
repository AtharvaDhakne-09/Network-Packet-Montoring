from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

MatchField = Literal["dst_port", "src_port", "port", "protocol", "classification", "any"]


class PriorityRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    match: MatchField = "dst_port"
    value: str = ""
    priority: int = Field(default=3, ge=1, le=4)
    label: str = ""
    enabled: bool = True

    @field_validator("value")
    @classmethod
    def _clean(cls, v: str) -> str:
        return v.strip()


class AppSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_packet_history: int = Field(default=5000, ge=100, le=200000)
    max_capture_duration: float = Field(default=0.0, ge=0.0, le=86400.0)
    max_capture_packets: int = Field(default=0, ge=0, le=10000000)
    default_filter: str = ""
    default_capacity: int = Field(default=32, ge=2, le=4096)
    default_service_rate: float = Field(default=200.0, gt=0.0, le=1000000.0)
    default_rate_mode: Literal["pps", "bps"] = "pps"
    default_link_rate_mbps: float = Field(default=100.0, gt=0.0, le=100000.0)
    default_time_scale: float = Field(default=1.0, gt=0.0, le=1000.0)
    sessions_retained: int = Field(default=5, ge=1, le=50)
    chart_refresh_ms: int = Field(default=1000, ge=250, le=60000)
    dashboard_refresh_ms: int = Field(default=1000, ge=250, le=60000)
    animations: bool = True
    priority_rules: list[PriorityRule] = Field(default_factory=list)

    @field_validator("default_filter")
    @classmethod
    def _strip_filter(cls, v: str) -> str:
        return v.strip()


def default_priority_rules() -> list[PriorityRule]:
    return [
        PriorityRule(match="protocol", value="ICMP", priority=2, label="ICMP control traffic"),
        PriorityRule(match="protocol", value="ICMPv6", priority=2, label="ICMPv6 control traffic"),
        PriorityRule(match="dst_port", value="53", priority=1, label="DNS queries"),
        PriorityRule(match="dst_port", value="67", priority=1, label="DHCP server"),
        PriorityRule(match="dst_port", value="123", priority=2, label="NTP time sync"),
        PriorityRule(match="dst_port", value="22", priority=2, label="SSH interactive"),
        PriorityRule(match="dst_port", value="443", priority=3, label="HTTPS bulk"),
        PriorityRule(match="dst_port", value="80", priority=3, label="HTTP bulk"),
        PriorityRule(match="dst_port", value="1935", priority=4, label="Media streaming"),
        PriorityRule(match="dst_port", value="5001", priority=4, label="Bulk file transfer"),
    ]
