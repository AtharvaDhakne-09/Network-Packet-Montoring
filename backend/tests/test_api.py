import copy
import time

import pytest
from fastapi.testclient import TestClient

from app import config as config_module
from app.capture.manager import CaptureError
from app.capture.session import CaptureSession
from app.main import create_app
from tests.conftest import make_packet


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr(config_module, "SETTINGS_FILE", tmp_path / "settings.json")
    monkeypatch.setattr(config_module, "DATA_DIR", tmp_path)
    monkeypatch.setattr(config_module, "_settings", None)
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    monkeypatch.setattr(config_module, "_settings", None)


def _fake_session(session_id="abc123"):
    session = CaptureSession(
        session_id=session_id,
        interface_id="iface",
        interface_name="Wi-Fi",
        filter="",
        max_packets=0,
        max_duration=0,
        started_at=time.time(),
        status="running",
    )
    return session


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["capture_state"] == "idle"
    assert "scapy" in body


def test_interfaces_success(client, monkeypatch):
    fake = [
        {
            "id": "npf-x",
            "name": "Wi-Fi",
            "description": "Wireless",
            "network_name": "npf-x",
            "is_up": True,
            "is_running": True,
            "is_loopback": False,
            "is_wireless": True,
            "is_connected": True,
            "addresses": ["192.168.0.5"],
            "ipv4": ["192.168.0.5"],
            "ipv6": [],
            "mac": None,
            "recommended": True,
        }
    ]
    monkeypatch.setattr(client.app.state.capture_manager, "interfaces", lambda: fake)
    response = client.get("/api/interfaces")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_interfaces_failure_returns_503(client, monkeypatch):
    def boom():
        raise RuntimeError("npcap missing")

    monkeypatch.setattr(client.app.state.capture_manager, "interfaces", boom)
    response = client.get("/api/interfaces")
    assert response.status_code == 503


def test_capture_start_validation(client):
    response = client.post("/api/capture/start", json={"interface_id": ""})
    assert response.status_code == 422
    response = client.post("/api/capture/start", json={"max_packets": -5, "interface_id": "x"})
    assert response.status_code == 422


def test_capture_start_conflict(client, monkeypatch):
    async def fake_start(**kwargs):
        raise CaptureError("A capture session is already running. Stop it first.", 409)

    monkeypatch.setattr(client.app.state.capture_manager, "start", fake_start)
    response = client.post("/api/capture/start", json={"interface_id": "x"})
    assert response.status_code == 409
    assert "already running" in response.json()["detail"]


def test_capture_start_success(client, monkeypatch):
    session = _fake_session()

    async def fake_start(**kwargs):
        return session

    monkeypatch.setattr(client.app.state.capture_manager, "start", fake_start)
    response = client.post("/api/capture/start", json={"interface_id": "x"})
    assert response.status_code == 200
    assert response.json()["session"]["session_id"] == "abc123"


def test_capture_status_idle(client):
    response = client.get("/api/capture/status")
    assert response.status_code == 200
    assert response.json()["state"] == "idle"


def test_metrics_without_session(client):
    response = client.get("/api/capture/metrics")
    assert response.status_code == 200
    assert response.json()["metrics"] is None


def test_packets_without_session(client):
    response = client.get("/api/capture/packets")
    assert response.status_code == 200
    assert response.json()["total"] == 0


def test_sessions_endpoint(client):
    response = client.get("/api/capture/sessions")
    assert response.status_code == 200
    assert response.json()["sessions"] == []


def test_stop_without_session_returns_404(client):
    response = client.post("/api/capture/stop", json={})
    assert response.status_code == 404


def test_clear_history_without_session(client):
    response = client.delete("/api/capture/history")
    assert response.status_code == 200
    assert response.json()["removed"] == 0


def test_settings_roundtrip_and_validation(client):
    response = client.get("/api/settings")
    assert response.status_code == 200
    body = response.json()
    assert "settings" in body and "options" in body

    invalid = copy.deepcopy(body["settings"])
    invalid["max_packet_history"] = 5
    response = client.put("/api/settings", json=invalid)
    assert response.status_code == 422

    valid = copy.deepcopy(body["settings"])
    valid["max_packet_history"] = 1234
    response = client.put("/api/settings", json=valid)
    assert response.status_code == 200
    assert response.json()["settings"]["max_packet_history"] == 1234

    response = client.post("/api/settings/reset")
    assert response.status_code == 200
    assert response.json()["settings"]["max_packet_history"] == 5000


def test_simulation_compare_with_trace(client, monkeypatch):
    trace = [make_packet(event_id=f"e{i}", timestamp=1000.0 + i, priority=(i % 4) + 1) for i in range(10)]
    monkeypatch.setattr(client.app.state.capture_manager, "get_trace", lambda *a, **k: trace)
    response = client.post("/api/simulation/compare", json={"capacity": 4, "service_rate": 1.0, "window": 10})
    assert response.status_code == 200
    body = response.json()
    assert body["fifo"]["offered_packets"] == 10
    assert body["priority"]["offered_packets"] == 10
    assert body["trace"]["packets"] == 10


def test_simulation_compare_without_trace(client, monkeypatch):
    def boom(*args, **kwargs):
        raise CaptureError("The selected capture session has no packets yet.", 400)

    monkeypatch.setattr(client.app.state.capture_manager, "get_trace", boom)
    response = client.post("/api/simulation/compare", json={})
    assert response.status_code == 400


def test_simulation_start_validation(client):
    response = client.post("/api/simulation/start", json={"capacity": 1})
    assert response.status_code == 422


def test_simulation_state_without_run(client):
    response = client.get("/api/simulation/state")
    assert response.status_code == 404


def test_simulation_controls_without_run(client):
    assert client.post("/api/simulation/pause", json={}).status_code == 404
    assert client.post("/api/simulation/resume", json={}).status_code == 404
    assert client.post("/api/simulation/step", json={}).status_code == 404
    assert client.post("/api/simulation/reset", json={}).status_code == 404
