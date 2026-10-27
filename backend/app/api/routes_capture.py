from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..capture.manager import CaptureError, CaptureManager
from ..models.schemas import CaptureStartRequest, CaptureStopRequest, FilterRequest
from .deps import get_capture_manager

router = APIRouter(tags=["capture"])


def _handle(exc: CaptureError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/api/interfaces")
def interfaces(capture: CaptureManager = Depends(get_capture_manager)) -> dict:
    try:
        items = capture.interfaces()
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"Interface discovery failed: {exc}. Ensure Npcap is installed and Scapy can access it.",
        ) from exc
    return {"interfaces": items, "count": len(items)}


@router.post("/api/capture/start")
async def start_capture(
    payload: CaptureStartRequest,
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    try:
        session = await capture.start(
            interface_id=payload.interface_id,
            capture_filter=payload.filter,
            max_packets=payload.max_packets,
            max_duration=payload.max_duration,
            priority_rules=payload.priority_rules,
        )
    except CaptureError as exc:
        raise _handle(exc) from exc
    return {"session": session.to_dict()}


@router.post("/api/capture/stop")
async def stop_capture(
    payload: CaptureStopRequest | None = None,
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    session_id = payload.session_id if payload else None
    try:
        result = await capture.stop(session_id)
    except CaptureError as exc:
        raise _handle(exc) from exc
    return {"session": result}


@router.get("/api/capture/status")
def capture_status(
    session_id: str | None = Query(default=None),
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    return capture.status(session_id)


@router.get("/api/capture/sessions")
def capture_sessions(capture: CaptureManager = Depends(get_capture_manager)) -> dict:
    sessions = capture.list_sessions()
    return {"sessions": sessions, "count": len(sessions)}


@router.get("/api/capture/packets")
def capture_packets(
    session_id: str | None = Query(default=None),
    q: str = Query(default=""),
    protocol: str = Query(default=""),
    ip: str = Query(default=""),
    port: int | None = Query(default=None),
    since: float | None = Query(default=None),
    until: float | None = Query(default=None),
    sort: str = Query(default="timestamp"),
    order: str = Query(default="desc"),
    limit: int = Query(default=100, ge=1, le=2000),
    offset: int = Query(default=0, ge=0),
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    return capture.query_packets(
        session_id=session_id,
        search=q,
        protocol=protocol,
        ip=ip,
        port=port,
        since=since,
        until=until,
        sort=sort,
        order=order,
        limit=limit,
        offset=offset,
    )


@router.get("/api/capture/metrics")
def capture_metrics(
    session_id: str | None = Query(default=None),
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    metrics = capture.metrics(session_id)
    if metrics is None:
        return {
            "metrics": None,
            "session_id": None,
            "message": "No capture session yet. Select an interface and start monitoring.",
        }
    session = capture.get_session(session_id) or capture.latest_session()
    return {"metrics": metrics, "session_id": session.session_id if session else None}


@router.post("/api/capture/filter")
async def set_filter(
    payload: FilterRequest,
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    try:
        session = await capture.set_filter(payload.session_id, payload.filter)
    except CaptureError as exc:
        raise _handle(exc) from exc
    return {"session": session}


@router.delete("/api/capture/history")
def clear_history(
    session_id: str | None = Query(default=None),
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    try:
        return capture.clear_history(session_id)
    except CaptureError as exc:
        raise _handle(exc) from exc
