from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..config import WS_BATCH_INTERVAL, WS_BATCH_SIZE, WS_HEARTBEAT_INTERVAL, WS_QUEUE_SIZE
from ..websocket.hub import WsSubscriber, stream_messages, stream_packets

router = APIRouter(tags=["websocket"])


async def _locked_send(ws: WebSocket, lock: asyncio.Lock, payload: dict) -> None:
    async with lock:
        await ws.send_json(payload)


@router.websocket("/ws/capture/{session_id}")
async def capture_ws(
    websocket: WebSocket,
    session_id: str,
    batch_size: int = Query(default=WS_BATCH_SIZE, ge=1, le=500),
    interval: float = Query(default=WS_BATCH_INTERVAL, ge=0.02, le=5.0),
) -> None:
    capture = websocket.app.state.capture_manager
    await websocket.accept()

    session = capture.get_session(session_id)
    if session is None:
        await websocket.send_json(
            {"type": "error", "detail": f"Unknown capture session '{session_id}'."}
        )
        await websocket.close(code=4004)
        return

    lock = asyncio.Lock()
    subscriber = WsSubscriber(
        queue_size=WS_QUEUE_SIZE,
        batch_size=batch_size,
        batch_interval=interval,
        name=f"ws-{session_id}",
    )
    capture.hub.subscribe(session_id, subscriber)

    def frame_builder(batch: list) -> dict:
        return {
            "type": "packets",
            "session_id": session_id,
            "packets": [packet.to_row() for packet in batch],
            "metrics": capture.metrics(session_id),
            "session": session.to_dict(),
            "client": subscriber.stats(),
        }

    async def send_frame(payload: dict) -> None:
        await _locked_send(websocket, lock, payload)

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(WS_HEARTBEAT_INTERVAL)
            await send_frame(
                {
                    "type": "metrics",
                    "session_id": session_id,
                    "metrics": capture.metrics(session_id),
                    "session": session.to_dict(),
                    "client": subscriber.stats(),
                }
            )

    await send_frame(
        {
            "type": "hello",
            "session_id": session_id,
            "session": session.to_dict(),
            "metrics": capture.metrics(session_id),
            "batch_size": batch_size,
            "interval": interval,
        }
    )

    sender_task = asyncio.create_task(stream_packets(send_frame, subscriber, frame_builder))
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        while True:
            message = await websocket.receive_json()
            msg_type = message.get("type") if isinstance(message, dict) else None
            if msg_type == "ping":
                await send_frame({"type": "pong"})
            elif msg_type == "set_stream":
                if isinstance(message.get("batch_size"), int):
                    subscriber.batch_size = max(1, min(int(message["batch_size"]), 500))
                if isinstance(message.get("interval"), (int, float)):
                    subscriber.batch_interval = max(0.02, min(float(message["interval"]), 5.0))
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        sender_task.cancel()
        heartbeat_task.cancel()
        for task in (sender_task, heartbeat_task):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        capture.hub.unsubscribe(session_id, subscriber)


@router.websocket("/ws/simulation/{sim_id}")
async def simulation_ws(websocket: WebSocket, sim_id: str) -> None:
    simulation = websocket.app.state.simulation_manager
    await websocket.accept()

    run = simulation.get_run(sim_id)
    if run is None:
        await websocket.send_json(
            {"type": "error", "detail": f"Unknown simulation '{sim_id}'."}
        )
        await websocket.close(code=4004)
        return

    lock = asyncio.Lock()
    subscriber = WsSubscriber(queue_size=64, batch_size=8, batch_interval=0.1, name=f"sim-{sim_id}")
    simulation.hub.subscribe(sim_id, subscriber)

    async def send_frame(payload: dict) -> None:
        await _locked_send(websocket, lock, payload)

    await send_frame({"type": "state", **run.to_dict()})

    async def heartbeat() -> None:
        while True:
            await asyncio.sleep(1.0)
            await send_frame({"type": "state", **run.to_dict()})

    sender_task = asyncio.create_task(stream_messages(send_frame, subscriber))
    heartbeat_task = asyncio.create_task(heartbeat())
    try:
        while True:
            message = await websocket.receive_json()
            if isinstance(message, dict) and message.get("type") == "ping":
                await send_frame({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        sender_task.cancel()
        heartbeat_task.cancel()
        for task in (sender_task, heartbeat_task):
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        simulation.hub.unsubscribe(sim_id, subscriber)
