import asyncio
import os

import pytest

from app.capture.interfaces import list_interfaces
from app.capture.manager import CaptureManager
from app.websocket.hub import CaptureHub

pytestmark = pytest.mark.skipif(
    not os.environ.get("NTL_LIVE_CAPTURE"),
    reason="Set NTL_LIVE_CAPTURE=1 to run live capture integration tests.",
)


def _pick_interface():
    interfaces = list_interfaces()
    for iface in interfaces:
        if iface.name == "Wi-Fi" or iface.name.lower().startswith("wi-fi"):
            return iface
    for iface in interfaces:
        if iface.recommended:
            return iface
    pytest.skip("No recommended capture interface available.")


def test_live_capture_start_stop_and_metadata():
    iface = _pick_interface()
    manager = CaptureManager(CaptureHub())

    async def run():
        session = await manager.start(iface.id, "ip or ip6", max_duration=6)
        assert session.status == "running"
        await asyncio.sleep(4)
        status = manager.status()
        assert status["state"] == "running"
        assert session.packets_delivered >= 0
        assert session.packets_ingested <= session.packets_delivered
        stopped = await manager.stop()
        assert stopped["status"] == "stopped"
        for packet in session.packets:
            assert packet.session_id == session.session_id
            assert packet.interface
            assert packet.length >= 0
            assert packet.direction is None

    asyncio.run(run())


def test_live_capture_rejects_second_session():
    iface = _pick_interface()
    manager = CaptureManager(CaptureHub())

    async def run():
        await manager.start(iface.id, "ip", max_duration=3)
        from app.capture.manager import CaptureError

        with pytest.raises(CaptureError):
            await manager.start(iface.id, "ip")
        await manager.stop()

    asyncio.run(run())


def test_live_capture_invalid_filter():
    iface = _pick_interface()
    manager = CaptureManager(CaptureHub())

    async def run():
        from app.capture.manager import CaptureError

        with pytest.raises(CaptureError):
            await manager.start(iface.id, "this is not ( valid")

    asyncio.run(run())
