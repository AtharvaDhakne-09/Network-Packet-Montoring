from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..config import get_settings, save_settings
from ..models.settings import AppSettings, default_priority_rules

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _options() -> dict:
    return {
        "rate_modes": ["pps", "bps"],
        "time_scales": [1, 2, 5, 10, 25, 50, 0],
        "priorities": [
            {"value": 1, "label": "Critical (1)"},
            {"value": 2, "label": "High (2)"},
            {"value": 3, "label": "Normal (3)"},
            {"value": 4, "label": "Low (4)"},
        ],
        "priority_match_fields": ["dst_port", "src_port", "port", "protocol", "classification", "any"],
        "bounds": {
            "max_packet_history": [100, 200000],
            "max_capture_duration": [0, 86400],
            "max_capture_packets": [0, 10000000],
            "default_capacity": [2, 4096],
            "default_service_rate": [1, 1000000],
            "default_time_scale": [0, 1000],
            "sessions_retained": [1, 50],
            "chart_refresh_ms": [250, 60000],
            "dashboard_refresh_ms": [250, 60000],
        },
    }


@router.get("")
def read_settings() -> dict:
    return {
        "settings": get_settings().model_dump(),
        "defaults": AppSettings().model_dump(),
        "suggested_priority_rules": [rule.model_dump() for rule in default_priority_rules()],
        "options": _options(),
    }


@router.put("")
def update_settings(settings: AppSettings) -> dict:
    saved = save_settings(settings)
    return {"settings": saved.model_dump()}


@router.post("/reset")
def reset_settings() -> dict:
    saved = save_settings(AppSettings())
    return {"settings": saved.model_dump()}
