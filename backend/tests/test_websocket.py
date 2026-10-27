import asyncio
import time

from fastapi.testclient import TestClient

from app.capture.session import CaptureSession
from app.main import create_app
from app.websocket.hub import CaptureHub, SimulationHub, WsSubscriber, stream_packets


def make_session(session_id="sess-1"):
    return CaptureSession(
        session_id=session_id,
        interface_id="iface",
        interface_name="Wi-Fi",
        filter="",
        max_packets=0,
        max_duration=0,
        started_at=time.time(),
        status="running",
    )


def test_capture_ws_unknown_session_closes():
    app = create_app()
    with TestClient(app) as client:
        with client.websocket_connect("/ws/capture/does-not-exist") as ws:
            message = ws.receive_json()
            assert message["type"] == "error"


def test_capture_ws_hello_and_ping():
    app = create_app()
    manager = app.state.capture_manager
    session = make_session("live-1")
    manager._sessions[session.session_id] = session
    manager._order.append(session.session_id)
    manager._active_id = session.session_id

    with TestClient(app) as client:
        with client.websocket_connect("/ws/capture/live-1") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"
            assert hello["session_id"] == "live-1"
            ws.send_json({"type": "ping"})
            message = None
            for _ in range(3):
                message = ws.receive_json()
                if message["type"] == "pong":
                    break
            assert message["type"] == "pong"

    manager._active_id = None


def test_simulation_ws_unknown_run():
    app = create_app()
    with TestClient(app) as client:
        with client.websocket_connect("/ws/simulation/nope") as ws:
            message = ws.receive_json()
            assert message["type"] == "error"


async def test_subscriber_overflow_is_bounded():
    subscriber = WsSubscriber(queue_size=2, batch_size=5, batch_interval=0.05)
    for i in range(5):
        subscriber.offer(i)
    assert subscriber.queue.qsize() == 2
    assert subscriber.dropped_items == 3


async def test_subscriber_drop_oldest_keeps_latest():
    subscriber = WsSubscriber(queue_size=1, batch_size=5, batch_interval=0.05)
    subscriber.offer("old")
    subscriber.offer("new", drop_oldest=True)
    assert await subscriber.queue.get() == "new"


async def test_stream_packets_batches_items():
    frames = []

    async def send_frame(frame):
        frames.append(frame)

    subscriber = WsSubscriber(queue_size=10, batch_size=5, batch_interval=0.05)
    for i in range(3):
        subscriber.offer(i)

    task = asyncio.create_task(
        stream_packets(send_frame, subscriber, lambda batch: {"type": "packets", "count": len(batch)})
    )
    await asyncio.sleep(0.1)
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    assert frames
    assert frames[0]["count"] == 3
    assert subscriber.packets_sent == 3


def test_capture_hub_publish_counts_delivered():
    hub = CaptureHub()
    subscriber = WsSubscriber(queue_size=10)
    hub.subscribe("s1", subscriber)
    assert hub.publish("s1", object()) == 1
    assert hub.publish("s1", object()) == 1
    assert hub.subscriber_count("s1") == 1
    hub.unsubscribe("s1", subscriber)
    assert hub.subscriber_count("s1") == 0
    assert hub.stats()["subscribers"] == 0


def test_capture_hub_isolates_sessions():
    hub = CaptureHub()
    sub = WsSubscriber(queue_size=10)
    hub.subscribe("s1", sub)
    assert hub.publish("s2", object()) == 0
    assert sub.queue.qsize() == 0


def test_simulation_hub_bounded_latest():
    hub = SimulationHub()
    sub = WsSubscriber(queue_size=1)
    hub.subscribe("sim", sub)
    hub.publish("sim", {"type": "state", "n": 1})
    hub.publish("sim", {"type": "state", "n": 2})
    assert sub.queue.qsize() == 1
