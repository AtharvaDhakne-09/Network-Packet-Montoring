from __future__ import annotations

from pathlib import Path
from typing import Any

from .models.settings import AppSettings

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
SETTINGS_FILE = DATA_DIR / "settings.json"

CAPTURE_THREAD_QUEUE_SIZE = 20000
MAX_SESSIONS_RETAINED = 6
MAX_SIM_RUNS_RETAINED = 6
WS_QUEUE_SIZE = 2000
WS_BATCH_SIZE = 50
WS_BATCH_INTERVAL = 0.15
WS_HEARTBEAT_INTERVAL = 1.0
SIM_STREAM_INTERVAL = 0.1

_settings: AppSettings | None = None


def get_settings() -> AppSettings:
    global _settings
    if _settings is None:
        _settings = _load_settings()
    return _settings


def save_settings(settings: AppSettings) -> AppSettings:
    global _settings
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SETTINGS_FILE.write_text(settings.model_dump_json(indent=2), encoding="utf-8")
    _settings = settings
    return _settings


def _load_settings() -> AppSettings:
    if SETTINGS_FILE.exists():
        try:
            raw: Any = SETTINGS_FILE.read_text(encoding="utf-8")
            return AppSettings.model_validate_json(raw)
        except Exception:
            return AppSettings()
    return AppSettings()
