import os
import sys
import time

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.models.packet import PacketMetadata  # noqa: E402


def make_packet(
    protocol: str = "TCP",
    src_ip: str = "10.0.0.1",
    dst_ip: str = "10.0.0.2",
    src_port: int | None = 12345,
    dst_port: int | None = 443,
    length: int = 100,
    timestamp: float | None = None,
    priority: int = 3,
    tcp_flags: str | None = "ACK",
    ip_version: int = 4,
    event_id: str | None = None,
    classification: str = "HTTPS/TLS",
) -> PacketMetadata:
    return PacketMetadata(
        event_id=event_id or os.urandom(8).hex(),
        session_id="test-session",
        timestamp=timestamp if timestamp is not None else time.time(),
        src_ip=src_ip,
        dst_ip=dst_ip,
        src_port=src_port if protocol in ("TCP", "UDP") else None,
        dst_port=dst_port if protocol in ("TCP", "UDP") else None,
        protocol=protocol,
        length=length,
        ip_version=ip_version,
        tcp_flags=tcp_flags if protocol == "TCP" else None,
        interface="test-iface",
        classification=classification,
        flow_id=f"{protocol.lower()}-flow",
        priority=priority,
    )


@pytest.fixture
def packet_factory():
    return make_packet
