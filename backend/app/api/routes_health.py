from __future__ import annotations

import platform
import time

from fastapi import APIRouter, Depends

from .. import APP_NAME, APP_VERSION
from ..capture.manager import CaptureManager
from .deps import get_capture_manager

router = APIRouter(tags=["health"])
START_TIME = time.time()


def _npcap_status() -> dict:
    if platform.system() != "Windows":
        return {"platform": platform.system(), "npcap": None, "hint": "libpcap is used on this platform."}
    import ctypes

    try:
        ctypes.WinDLL("wpcap.dll")
        available = True
    except OSError:
        available = False
    return {
        "platform": "Windows",
        "npcap": available,
        "hint": "Npcap is required for live capture on Windows (https://npcap.com).",
    }


@router.get("/api/health")
def health(capture: CaptureManager = Depends(get_capture_manager)) -> dict:
    try:
        import scapy

        scapy_version = scapy.__version__
    except Exception:  # noqa: BLE001
        scapy_version = None
    active = capture.active_session
    return {
        "status": "ok",
        "app": APP_NAME,
        "version": APP_VERSION,
        "uptime_seconds": round(time.time() - START_TIME, 1),
        "python": platform.python_version(),
        "scapy": scapy_version,
        "capture_state": active.status if active else "idle",
        "active_session_id": active.session_id if active else None,
        "driver": _npcap_status(),
        "hub": capture.hub.stats(),
    }
