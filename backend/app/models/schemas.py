from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .settings import PriorityRule


class CaptureStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    interface_id: str = Field(min_length=1)
    filter: str = ""
    max_packets: int = Field(default=0, ge=0, le=10000000)
    max_duration: float = Field(default=0.0, ge=0.0, le=86400.0)
    priority_rules: list[PriorityRule] = Field(default_factory=list)

    @field_validator("filter")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class CaptureStopRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str | None = None


class FilterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str | None = None
    filter: str = ""

    @field_validator("filter")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class SimulationStartRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    policy: Literal["fifo", "priority"] = "fifo"
    capacity: int = Field(default=32, ge=2, le=4096)
    rate_mode: Literal["pps", "bps"] = "pps"
    service_rate: float = Field(default=200.0, gt=0.0, le=1000000.0)
    link_rate_mbps: float = Field(default=100.0, gt=0.0, le=100000.0)
    time_scale: float = Field(default=1.0, ge=0.0, le=1000.0)
    session_id: str | None = None
    window: int = Field(default=500, ge=1, le=50000)
    offset: int = Field(default=0, ge=0)
    priority_rules: list[PriorityRule] = Field(default_factory=list)
    default_priority: int = Field(default=3, ge=1, le=4)
    label: str = ""


class SimulationControlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sim_id: str | None = None


class ComparisonRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str | None = None
    window: int = Field(default=500, ge=1, le=50000)
    offset: int = Field(default=0, ge=0)
    capacity: int = Field(default=32, ge=2, le=4096)
    rate_mode: Literal["pps", "bps"] = "pps"
    service_rate: float = Field(default=200.0, gt=0.0, le=1000000.0)
    link_rate_mbps: float = Field(default=100.0, gt=0.0, le=100000.0)
    priority_rules: list[PriorityRule] = Field(default_factory=list)
    default_priority: int = Field(default=3, ge=1, le=4)


class ErrorResponse(BaseModel):
    detail: str
