from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from ..capture.manager import CaptureError, CaptureManager
from ..models.schemas import ComparisonRequest, SimulationControlRequest, SimulationStartRequest
from ..simulation import SimulationConfig, SimulationError, SimulationManager, run_comparison
from .deps import get_capture_manager, get_simulation_manager

router = APIRouter(prefix="/api/simulation", tags=["simulation"])


def _capture_error(exc: CaptureError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _sim_error(exc: SimulationError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.message)


def _build_config(payload: SimulationStartRequest) -> SimulationConfig:
    return SimulationConfig(
        policy=payload.policy,
        capacity=payload.capacity,
        rate_mode=payload.rate_mode,
        service_rate=payload.service_rate,
        link_rate_mbps=payload.link_rate_mbps,
        time_scale=payload.time_scale,
        priority_rules=payload.priority_rules,
        default_priority=payload.default_priority,
        session_id=payload.session_id,
        window=payload.window,
        offset=payload.offset,
        label=payload.label,
    )


@router.post("/start")
def start(
    payload: SimulationStartRequest,
    capture: CaptureManager = Depends(get_capture_manager),
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    config = _build_config(payload)
    try:
        trace = capture.get_trace(payload.session_id, payload.window, payload.offset)
    except CaptureError as exc:
        raise _capture_error(exc) from exc
    session = capture.get_session(payload.session_id) or capture.latest_session()
    source = {
        "session_id": session.session_id if session else None,
        "interface_name": session.interface_name if session else None,
        "window": payload.window,
        "offset": payload.offset,
    }
    try:
        run = simulation.start(trace, config, source)
    except SimulationError as exc:
        raise _sim_error(exc) from exc
    return run.to_dict()


@router.get("/runs")
def runs(simulation: SimulationManager = Depends(get_simulation_manager)) -> dict:
    items = simulation.list_runs()
    return {"runs": items, "count": len(items)}


@router.get("/state")
def state(
    sim_id: str | None = Query(default=None),
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return simulation.state(sim_id)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/pause")
def pause(
    payload: SimulationControlRequest | None = None,
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return simulation.pause(payload.sim_id if payload else None)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/resume")
def resume(
    payload: SimulationControlRequest | None = None,
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return simulation.resume(payload.sim_id if payload else None)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/step")
def step(
    payload: SimulationControlRequest | None = None,
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return simulation.step(payload.sim_id if payload else None)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/reset")
def reset(
    payload: SimulationControlRequest | None = None,
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return simulation.reset(payload.sim_id if payload else None)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/stop")
async def stop(
    payload: SimulationControlRequest | None = None,
    simulation: SimulationManager = Depends(get_simulation_manager),
) -> dict:
    try:
        return await simulation.stop(payload.sim_id if payload else None)
    except SimulationError as exc:
        raise _sim_error(exc) from exc


@router.post("/compare")
def compare(
    payload: ComparisonRequest,
    capture: CaptureManager = Depends(get_capture_manager),
) -> dict:
    try:
        trace = capture.get_trace(payload.session_id, payload.window, payload.offset)
    except CaptureError as exc:
        raise _capture_error(exc) from exc
    config = SimulationConfig(
        policy="fifo",
        capacity=payload.capacity,
        rate_mode=payload.rate_mode,
        service_rate=payload.service_rate,
        link_rate_mbps=payload.link_rate_mbps,
        priority_rules=payload.priority_rules,
        default_priority=payload.default_priority,
        session_id=payload.session_id,
        window=payload.window,
        offset=payload.offset,
    )
    try:
        return run_comparison(trace, config)
    except SimulationError as exc:
        raise _sim_error(exc) from exc
