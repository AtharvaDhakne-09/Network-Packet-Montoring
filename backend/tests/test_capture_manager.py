import asyncio
import queue

import pytest
from scapy.layers.inet import IP, TCP
from scapy.layers.l2 import Ether

from app.capture.manager import CaptureError, CaptureManager
from app.capture.session import CaptureSession
from app.websocket.hub import CaptureHub


@pytest.fixture
def manager(monkeypatch):
    monkeypatch.setattr(CaptureManager, "_resolve_interface", lambda self, interface_id: object())
    monkeypatch.setattr(CaptureManager, "validate_filter", lambda self, interface_id, capture_filter: None)
    monkeypatch.setattr(CaptureManager, "_poll_os_stats", lambda self, session: None)

    def fake_start_sniffer(self, session, iface):
        session.runtime["sniffer"] = None
        session.runtime["socket"] = None

    monkeypatch.setattr(CaptureManager, "_start_sniffer", fake_start_sniffer)
    return CaptureManager(CaptureHub())


async def test_start_stop_lifecycle(manager):
    session = await manager.start("fake-iface")
    assert session.status == "running"
    assert manager.active_session is session
    result = await manager.stop()
    assert result["status"] == "stopped"
    assert manager.active_session is None
    assert result["end_reason"] == "user_stopped"


async def test_duplicate_session_prevented(manager):
    await manager.start("fake-iface")
    with pytest.raises(CaptureError) as exc:
        await manager.start("fake-iface")
    assert exc.value.status_code == 409
    await manager.stop()


async def test_ingest_records_packets_and_metrics(manager):
    session = await manager.start("fake-iface")
    thread_queue = session.runtime["thread_queue"]
    from tests.conftest import make_packet

    for i in range(10):
        thread_queue.put_nowait(make_packet(event_id=f"e{i}", length=50))
    await asyncio.sleep(0.15)
    assert session.packets_ingested == 10
    assert session.metrics.snapshot()["total_packets"] == 10
    assert session.metrics.snapshot()["total_bytes"] == 500
    await manager.stop()


async def test_application_queue_overflow_counted(manager, monkeypatch):
    monkeypatch.setattr("app.capture.manager.CAPTURE_THREAD_QUEUE_SIZE", 1)
    session = await manager.start("fake-iface")
    pkt = Ether() / IP() / TCP() / b"payload"
    manager._on_packet(session, pkt)
    manager._on_packet(session, pkt)
    manager._on_packet(session, pkt)
    assert session.packets_delivered == 3
    assert session.app_queue_dropped == 2
    await manager.stop()


async def test_packets_query_filters_and_pagination(manager):
    session = await manager.start("fake-iface")
    thread_queue = session.runtime["thread_queue"]
    from tests.conftest import make_packet

    thread_queue.put_nowait(make_packet(protocol="TCP", dst_port=443, event_id="t1"))
    thread_queue.put_nowait(make_packet(protocol="UDP", dst_port=53, event_id="u1"))
    thread_queue.put_nowait(make_packet(protocol="UDP", dst_port=53, event_id="u2"))
    await asyncio.sleep(0.15)

    all_packets = manager.query_packets(limit=10)
    assert all_packets["total"] == 3

    udp_only = manager.query_packets(protocol="UDP", limit=10)
    assert udp_only["total"] == 2

    by_port = manager.query_packets(port=443, limit=10)
    assert by_port["total"] == 1

    paged = manager.query_packets(limit=2, offset=0)
    assert paged["returned"] == 2
    assert paged["total"] == 3
    await manager.stop()


async def test_clear_history(manager):
    session = await manager.start("fake-iface")
    from tests.conftest import make_packet

    session.runtime["thread_queue"].put_nowait(make_packet())
    await asyncio.sleep(0.15)
    result = manager.clear_history(session.session_id)
    assert result["removed"] == 1
    assert manager.query_packets()["total"] == 0
    await manager.stop()


async def test_stop_without_session_raises(manager):
    with pytest.raises(CaptureError) as exc:
        await manager.stop()
    assert exc.value.status_code == 404


def test_set_filter_rejects_invalid(manager, monkeypatch):
    def bad_validate(self, interface_id, capture_filter):
        raise CaptureError("Invalid capture filter: syntax error", 400)

    monkeypatch.setattr(CaptureManager, "validate_filter", bad_validate)

    async def run():
        await manager.start("fake-iface")
        with pytest.raises(CaptureError):
            await manager.set_filter(None, "not a filter ((")
        await manager.stop()

    asyncio.run(run())


def test_session_history_is_bounded(packet_factory):
    session = CaptureSession(
        session_id="s",
        interface_id="i",
        interface_name="n",
        filter="",
        max_packets=0,
        max_duration=0,
        started_at=0.0,
    )
    for i in range(10):
        session.record(packet_factory(event_id=f"e{i}"), max_history=4)
    assert len(session.packets) == 4
    assert session.packets[0].event_id == "e6"
