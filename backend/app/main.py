from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import APP_NAME, APP_VERSION
from .api import routes_capture, routes_health, routes_settings, routes_simulation, routes_ws
from .capture.manager import CaptureError, CaptureManager
from .simulation.manager import SimulationManager
from .websocket.hub import CaptureHub, SimulationHub

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    app.state.capture_manager.bind_loop(loop)
    yield
    capture: CaptureManager = app.state.capture_manager
    if capture.active_session is not None:
        try:
            await capture.stop()
        except Exception:  # noqa: BLE001
            pass


def create_app() -> FastAPI:
    app = FastAPI(
        title=f"{APP_NAME} API",
        version=APP_VERSION,
        description=(
            "Real-time network packet capture and DSA router simulation API. "
            "Captures live packet metadata from local interfaces via Npcap/Scapy. "
            "No packet payloads are stored or transmitted."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ALLOWED_ORIGINS,
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.capture_manager = CaptureManager(CaptureHub())
    app.state.simulation_manager = SimulationManager(SimulationHub())

    @app.exception_handler(CaptureError)
    async def _capture_error(_request: Request, exc: CaptureError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    @app.exception_handler(ValueError)
    async def _value_error(_request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    app.include_router(routes_health.router)
    app.include_router(routes_capture.router)
    app.include_router(routes_simulation.router)
    app.include_router(routes_settings.router)
    app.include_router(routes_ws.router)

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/docs")

    return app


app = create_app()
