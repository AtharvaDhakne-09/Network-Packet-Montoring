from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from ..config import MAX_SIM_RUNS_RETAINED, SIM_STREAM_INTERVAL
from ..models.packet import PacketMetadata
from ..websocket.hub import SimulationHub
from .engine import POLICIES, RouterSimulation, SimulationConfig, compare_policies


class SimulationError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class SimulationRun:
    sim_id: str
    config: SimulationConfig
    engine: RouterSimulation
    trace: list[PacketMetadata]
    source: dict
    status: str = "running"
    created_at: float = field(default_factory=time.time)
    paused: bool = False
    step_credits: int = 0
    error: str | None = None
    runtime: dict[str, Any] = field(default_factory=dict)

    def to_dict(self, include_queue: bool = True) -> dict:
        snapshot = self.engine.snapshot() if include_queue else {
            "metrics": self.engine.metrics(),
            "progress": {
                "offered": self.engine.stats.offered,
                "total": len(self.trace),
                "sim_time": round(self.engine.sim_time, 6),
                "finished": self.engine.finished,
            },
            "queue": None,
        }
        return {
            "sim_id": self.sim_id,
            "status": self.status,
            "paused": self.paused,
            "config": self.config.to_dict(),
            "source": self.source,
            "created_at": self.created_at,
            "error": self.error,
            **snapshot,
        }


class SimulationManager:
    def __init__(self, hub: SimulationHub) -> None:
        self.hub = hub
        self._runs: dict[str, SimulationRun] = {}
        self._order: list[str] = []
        self._latest_id: str | None = None

    def _prune(self) -> None:
        while len(self._order) > MAX_SIM_RUNS_RETAINED:
            for sid in list(self._order):
                run = self._runs.get(sid)
                if run is not None and run.status != "running":
                    self._order.remove(sid)
                    self._runs.pop(sid, None)
                    break
            else:
                break

    def get_run(self, sim_id: str | None = None) -> SimulationRun | None:
        if sim_id:
            return self._runs.get(sim_id)
        if self._latest_id:
            return self._runs.get(self._latest_id)
        for sid in reversed(self._order):
            run = self._runs.get(sid)
            if run is not None:
                return run
        return None

    def list_runs(self) -> list[dict]:
        result = []
        for sid in reversed(self._order):
            run = self._runs.get(sid)
            if run is not None:
                result.append(run.to_dict(include_queue=False))
        return result

    def start(self, trace: list[PacketMetadata], config: SimulationConfig, source: dict) -> SimulationRun:
        if not trace:
            raise SimulationError("No captured packets available for this simulation.", 400)
        config.validate()
        sim_id = uuid.uuid4().hex[:12]
        engine = RouterSimulation(trace, config, sim_id=sim_id)
        run = SimulationRun(
            sim_id=sim_id,
            config=config,
            engine=engine,
            trace=trace,
            source=source,
            paused=False,
        )
        self._runs[sim_id] = run
        self._order.append(sim_id)
        self._latest_id = sim_id
        self._prune()
        run.runtime["wake"] = asyncio.Event()
        run.runtime["task"] = asyncio.ensure_future(self._runner(run))
        return run

    async def _runner(self, run: SimulationRun) -> None:
        wake: asyncio.Event = run.runtime["wake"]
        last_publish = 0.0
        try:
            while not run.engine.finished:
                if run.paused and run.step_credits <= 0:
                    wake.clear()
                    try:
                        await asyncio.wait_for(wake.wait(), timeout=1.0)
                    except asyncio.TimeoutError:
                        pass
                    self._publish(run)
                    continue
                if run.paused and run.step_credits > 0:
                    run.step_credits -= 1

                prev_time = run.engine.sim_time
                run.engine.step()
                delta = max(run.engine.sim_time - prev_time, 0.0)

                now = time.time()
                if run.paused or now - last_publish >= SIM_STREAM_INTERVAL:
                    self._publish(run)
                    last_publish = now

                if run.config.time_scale > 0:
                    await asyncio.sleep(min(delta / run.config.time_scale, 0.5))
                else:
                    await asyncio.sleep(0)

            run.status = "finished"
            run.paused = False
            self._publish(run)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            run.error = str(exc)
            run.status = "error"
            self._publish(run)

    def _publish(self, run: SimulationRun) -> None:
        if self.hub.subscriber_count(run.sim_id) == 0:
            return
        message = {"type": "state", **run.to_dict()}
        self.hub.publish(run.sim_id, message)

    def pause(self, sim_id: str | None) -> dict:
        run = self._require(sim_id)
        if run.status != "running":
            raise SimulationError("Simulation is not running.", 409)
        run.paused = True
        run.runtime["wake"].set()
        self._publish(run)
        return run.to_dict()

    def resume(self, sim_id: str | None) -> dict:
        run = self._require(sim_id)
        if run.status != "running":
            raise SimulationError("Simulation is not running.", 409)
        run.paused = False
        run.runtime["wake"].set()
        self._publish(run)
        return run.to_dict()

    def step(self, sim_id: str | None) -> dict:
        run = self._require(sim_id)
        if run.status != "running":
            raise SimulationError("Simulation is not running.", 409)
        if run.engine.finished:
            raise SimulationError("Simulation has already finished.", 409)
        run.paused = True
        run.step_credits += 1
        run.runtime["wake"].set()
        return run.to_dict()

    def reset(self, sim_id: str | None, trace: list[PacketMetadata] | None = None) -> dict:
        run = self._require(sim_id)
        self._cancel(run)
        trace = trace if trace is not None else run.trace
        if not trace:
            raise SimulationError("No trace available to reset the simulation.", 400)
        engine = RouterSimulation(trace, run.config, sim_id=run.sim_id)
        run.engine = engine
        run.trace = engine.trace
        run.status = "running"
        run.paused = False
        run.step_credits = 0
        run.error = None
        run.runtime["wake"] = asyncio.Event()
        run.runtime["task"] = asyncio.ensure_future(self._runner(run))
        self._publish(run)
        return run.to_dict()

    async def stop(self, sim_id: str | None) -> dict:
        run = self._require(sim_id)
        self._cancel(run)
        run.status = "stopped"
        run.paused = False
        self._publish(run)
        return run.to_dict()

    def state(self, sim_id: str | None) -> dict:
        run = self._require(sim_id)
        return run.to_dict()

    def _require(self, sim_id: str | None) -> SimulationRun:
        run = self.get_run(sim_id)
        if run is None:
            raise SimulationError("No simulation run found. Start a simulation first.", 404)
        return run

    def _cancel(self, run: SimulationRun) -> None:
        task: Optional[asyncio.Task] = run.runtime.get("task")
        if task is not None and not task.done():
            task.cancel()
        run.runtime["task"] = None


def run_comparison(
    trace: list[PacketMetadata],
    config: SimulationConfig,
) -> dict:
    if not trace:
        raise SimulationError("No captured packets available for comparison.", 400)
    if config.policy not in POLICIES:
        config.policy = "fifo"
    return compare_policies(trace, config)
