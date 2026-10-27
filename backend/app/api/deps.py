from fastapi import Request

from ..capture.manager import CaptureManager
from ..simulation.manager import SimulationManager


def get_capture_manager(request: Request) -> CaptureManager:
    return request.app.state.capture_manager


def get_simulation_manager(request: Request) -> SimulationManager:
    return request.app.state.simulation_manager
