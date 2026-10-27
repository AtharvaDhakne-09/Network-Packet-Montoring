from __future__ import annotations

import asyncio
import queue
import time
import uuid
from typing import Any

from ..analytics.priority import apply_priority
from ..config import CAPTURE_THREAD_QUEUE_SIZE, get_settings
from ..models.packet import PacketMetadata
from ..models.settings import PriorityRule
from ..websocket.hub import CaptureHub
from .interfaces import get_interface_by_id, list_interfaces
from .metadata import parse_packet
from .pcap_stats import read_pcap_stats
from .session import CaptureSession

LIVE_STATUSES = ("starting", "running", "stopping")


class CaptureError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class CaptureManager:
    def __init__(self, hub: CaptureHub) -> None:
        self.hub = hub
        self._sessions: dict[str, CaptureSession] = {}
        self._order: list[str] = []
        self._active_id: str | None = None
        self._lock = asyncio.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def _prune_sessions(self) -> None:
        settings = get_settings()
        keep = max(settings.sessions_retained, 1)
        while len(self._order) > keep:
            for sid in list(self._order):
                session = self._sessions.get(sid)
                if session is not None and session.status not in LIVE_STATUSES:
                    self._order.remove(sid)
                    self._sessions.pop(sid, None)
                    break
            else:
                break

    @property
    def active_session(self) -> CaptureSession | None:
        if self._active_id is None:
            return None
        session = self._sessions.get(self._active_id)
        if session is not None and session.status in LIVE_STATUSES:
            return session
        return None

    def get_session(self, session_id: str) -> CaptureSession | None:
        return self._sessions.get(session_id)

    def latest_session(self, live_only: bool = False) -> CaptureSession | None:
        for sid in reversed(self._order):
            session = self._sessions.get(sid)
            if session is None:
                continue
            if live_only and session.status not in LIVE_STATUSES:
                continue
            return session
        return None

    def list_sessions(self) -> list[dict]:
        result = []
        for sid in reversed(self._order):
            session = self._sessions.get(sid)
            if session is not None:
                result.append(session.to_dict())
        return result

    def validate_filter(self, interface_id: str, capture_filter: str) -> None:
        if not capture_filter:
            return
        from scapy.all import conf
        from scapy.data import ETH_P_ALL

        iface = self._resolve_interface(interface_id)
        try:
            sock = conf.L2listen(iface=iface, type=ETH_P_ALL, filter=capture_filter)
        except Exception as exc:  # noqa: BLE001
            raise CaptureError(f"Invalid capture filter: {exc}", 400) from exc
        try:
            sock.close()
        except Exception:
            pass

    def _resolve_interface(self, interface_id: str) -> Any:
        try:
            return get_interface_by_id(interface_id)
        except KeyError as exc:
            raise CaptureError(
                f"Interface '{interface_id}' was not found. Refresh the interface list.", 404
            ) from exc

    def _open_socket(self, iface: Any, capture_filter: str):
        from scapy.all import conf
        from scapy.data import ETH_P_ALL

        try:
            return conf.L2listen(iface=iface, type=ETH_P_ALL, filter=capture_filter or None)
        except Exception as exc:  # noqa: BLE001
            message = str(exc)
            if "permission" in message.lower() or "access" in message.lower():
                raise CaptureError(
                    "Capture permission denied. Run the backend with rights that allow Npcap access "
                    "or reinstall Npcap with 'Restrict to Administrators' disabled.",
                    403,
                ) from exc
            raise CaptureError(f"Unable to open capture interface: {message}", 500) from exc

    async def start(
        self,
        interface_id: str,
        capture_filter: str = "",
        max_packets: int = 0,
        max_duration: float = 0.0,
        priority_rules: list[PriorityRule] | None = None,
    ) -> CaptureSession:
        async with self._lock:
            if self.active_session is not None:
                raise CaptureError("A capture session is already running. Stop it first.", 409)

            settings = get_settings()
            iface = self._resolve_interface(interface_id)
            capture_filter = (capture_filter or "").strip()
            if capture_filter:
                self.validate_filter(interface_id, capture_filter)

            session_id = uuid.uuid4().hex[:12]
            session = CaptureSession(
                session_id=session_id,
                interface_id=interface_id,
                interface_name=getattr(iface, "name", interface_id),
                filter=capture_filter,
                max_packets=int(max_packets or settings.max_capture_packets),
                max_duration=float(max_duration or settings.max_capture_duration),
                started_at=time.time(),
                priority_rules=list(priority_rules or []),
            )
            session.runtime["thread_queue"] = queue.Queue(maxsize=CAPTURE_THREAD_QUEUE_SIZE)

            self._sessions[session_id] = session
            self._order.append(session_id)
            self._active_id = session_id
            self._prune_sessions()

            try:
                self._start_sniffer(session, iface)
            except CaptureError:
                session.status = "error"
                session.error = "Capture driver could not start"
                self._active_id = None
                raise
            except Exception as exc:  # noqa: BLE001
                session.status = "error"
                session.error = str(exc)
                self._active_id = None
                if "Npcap" in str(exc) or "wpcap" in str(exc).lower():
                    raise CaptureError(
                        "Npcap is not available. Install Npcap from https://npcap.com and retry.",
                        503,
                    ) from exc
                raise CaptureError(f"Failed to start capture: {exc}", 500) from exc

            session.status = "running"
            session.runtime["ingest_task"] = asyncio.ensure_future(self._ingest_loop(session))
            return session

    def _on_packet(self, session: CaptureSession, pkt: Any) -> None:
        session.packets_delivered += 1
        meta = parse_packet(
            pkt, session.session_id, session.interface_name, session.priority_rules
        )
        if meta is None:
            session.packets_ignored += 1
            return
        thread_queue: queue.Queue = session.runtime["thread_queue"]
        try:
            thread_queue.put_nowait(meta)
        except queue.Full:
            session.app_queue_dropped += 1

    def _start_sniffer(self, session: CaptureSession, iface: Any) -> None:
        from scapy.all import AsyncSniffer

        sock = self._open_socket(iface, session.filter)

        def callback(pkt: Any) -> None:
            self._on_packet(session, pkt)

        sniffer = AsyncSniffer(opened_socket=sock, prn=callback, store=False, quiet=True)
        sniffer.start()
        session.runtime["sniffer"] = sniffer
        session.runtime["socket"] = sock

    async def _ingest_loop(self, session: CaptureSession) -> None:
        settings = get_settings()
        last_stats = 0.0
        try:
            while session.status in LIVE_STATUSES:
                thread_queue: queue.Queue = session.runtime["thread_queue"]
                drained = 0
                while True:
                    try:
                        meta = thread_queue.get_nowait()
                    except queue.Empty:
                        break
                    self._ingest_packet(session, meta, settings.max_packet_history)
                    drained += 1

                now = time.time()
                if now - last_stats >= 1.0:
                    self._poll_os_stats(session)
                    last_stats = now

                if session.max_packets and session.packets_delivered >= session.max_packets:
                    await self._stop_internal(session, "max_packets_reached")
                    return
                if session.max_duration and session.duration >= session.max_duration:
                    await self._stop_internal(session, "max_duration_reached")
                    return

                await asyncio.sleep(0.005 if drained else 0.02)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            session.error = str(exc)
            await self._stop_internal(session, "error")

    def _ingest_packet(self, session: CaptureSession, packet: PacketMetadata, max_history: int) -> None:
        session.record(packet, max_history)
        session.metrics.record(packet)
        delivered = self.hub.publish(session.session_id, packet)
        session.streamed_packets += delivered

    def _poll_os_stats(self, session: CaptureSession) -> None:
        stats = read_pcap_stats(session.runtime.get("socket"))
        if stats is None:
            session.os_stats_available = False
            return
        received, dropped = stats
        session.os_stats_available = True
        session.os_packets_received = received
        session.os_packets_dropped = dropped

    async def stop(self, session_id: str | None = None) -> dict:
        async with self._lock:
            session = self._select_for_stop(session_id)
            if session is None:
                raise CaptureError("No capture session is running.", 404)
            if session.status not in LIVE_STATUSES:
                return session.to_dict()
            session.status = "stopping"
            await self._stop_internal(session, "user_stopped")
            return session.to_dict()

    def _select_for_stop(self, session_id: str | None) -> CaptureSession | None:
        if session_id:
            return self._sessions.get(session_id)
        return self.active_session or self.latest_session()

    async def _stop_internal(self, session: CaptureSession, reason: str) -> None:
        session.status = "stopping"
        sniffer = session.runtime.get("sniffer")
        if sniffer is not None:
            try:
                await asyncio.to_thread(self._safe_sniffer_stop, sniffer)
            except Exception:
                pass

        thread_queue: queue.Queue | None = session.runtime.get("thread_queue")
        if thread_queue is not None:
            settings = get_settings()
            while True:
                try:
                    meta = thread_queue.get_nowait()
                except queue.Empty:
                    break
                self._ingest_packet(session, meta, settings.max_packet_history)

        self._poll_os_stats(session)

        sock = session.runtime.get("socket")
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass

        session.status = "stopped"
        session.stopped_at = time.time()
        session.end_reason = reason
        if self._active_id == session.session_id:
            self._active_id = None

        task: asyncio.Task | None = session.runtime.get("ingest_task")
        current = asyncio.current_task()
        if task is not None and task is not current:
            task.cancel()
        session.runtime["ingest_task"] = None

    @staticmethod
    def _safe_sniffer_stop(sniffer: Any) -> None:
        try:
            sniffer.stop()
            sniffer.join(timeout=1.0)
        except TypeError:
            sniffer.stop()
        except Exception:
            pass

    async def set_filter(self, session_id: str | None, capture_filter: str) -> dict:
        session = self.active_session or (self._sessions.get(session_id) if session_id else None)
        if session is None or session.status not in LIVE_STATUSES:
            raise CaptureError("No live capture session to update.", 404)
        capture_filter = (capture_filter or "").strip()
        if capture_filter:
            self.validate_filter(session.interface_id, capture_filter)

        iface = self._resolve_interface(session.interface_id)
        sniffer = session.runtime.get("sniffer")
        if sniffer is not None:
            await asyncio.to_thread(self._safe_sniffer_stop, sniffer)
        sock = session.runtime.get("socket")
        if sock is not None:
            try:
                sock.close()
            except Exception:
                pass

        old_filter = session.filter
        session.filter = capture_filter
        try:
            self._start_sniffer(session, iface)
        except Exception as exc:  # noqa: BLE001
            session.filter = old_filter
            try:
                self._start_sniffer(session, iface)
            except Exception:
                session.status = "error"
                session.error = f"Filter update failed: {exc}"
                raise CaptureError(f"Filter update failed: {exc}", 500) from exc
            raise CaptureError(f"Invalid capture filter: {exc}", 400) from exc
        return session.to_dict()

    def status(self, session_id: str | None = None) -> dict:
        session = self.active_session
        if session is None and session_id:
            session = self._sessions.get(session_id)
        if session is None:
            session = self.latest_session()
        settings = get_settings()
        if session is None:
            return {
                "state": "idle",
                "session": None,
                "metrics": None,
                "hub": self.hub.stats(),
                "settings": {"max_packet_history": settings.max_packet_history},
            }
        return {
            "state": session.status,
            "session": session.to_dict(),
            "metrics": self.metrics(session.session_id),
            "hub": self.hub.stats(),
            "settings": {"max_packet_history": settings.max_packet_history},
        }

    def metrics(self, session_id: str | None = None) -> dict | None:
        session = self._resolve_session(session_id)
        if session is None:
            return None
        return session.metrics.snapshot()

    def _resolve_session(self, session_id: str | None) -> CaptureSession | None:
        if session_id:
            return self._sessions.get(session_id)
        return self.active_session or self.latest_session()

    def query_packets(
        self,
        session_id: str | None = None,
        search: str = "",
        protocol: str = "",
        ip: str = "",
        port: int | None = None,
        since: float | None = None,
        until: float | None = None,
        sort: str = "timestamp",
        order: str = "desc",
        limit: int = 100,
        offset: int = 0,
    ) -> dict:
        session = self._resolve_session(session_id)
        if session is None:
            return {"session_id": None, "total": 0, "returned": 0, "offset": offset, "limit": limit, "packets": []}

        packets = session.packets
        if search:
            needle = search.lower()
            packets = [
                p
                for p in packets
                if needle in (p.src_ip or "").lower()
                or needle in (p.dst_ip or "").lower()
                or needle in p.protocol.lower()
                or needle in p.classification.lower()
                or needle in (p.flow_id or "").lower()
                or (p.src_port is not None and needle in str(p.src_port))
                or (p.dst_port is not None and needle in str(p.dst_port))
            ]
        if protocol:
            protocols = {item.strip().lower() for item in protocol.split(",") if item.strip()}
            packets = [p for p in packets if p.protocol.lower() in protocols]
        if ip:
            packets = [p for p in packets if p.src_ip == ip or p.dst_ip == ip]
        if port is not None:
            packets = [p for p in packets if p.src_port == port or p.dst_port == port]
        if since is not None:
            packets = [p for p in packets if p.timestamp >= since]
        if until is not None:
            packets = [p for p in packets if p.timestamp <= until]

        reverse = order.lower() != "asc"
        key_map = {
            "timestamp": lambda p: p.timestamp,
            "length": lambda p: p.length,
            "protocol": lambda p: p.protocol,
            "src_ip": lambda p: p.src_ip or "",
            "dst_ip": lambda p: p.dst_ip or "",
            "src_port": lambda p: p.src_port if p.src_port is not None else -1,
            "dst_port": lambda p: p.dst_port if p.dst_port is not None else -1,
        }
        key_func = key_map.get(sort, key_map["timestamp"])
        packets = sorted(packets, key=key_func, reverse=reverse)

        total = len(packets)
        limit = max(1, min(int(limit), 2000))
        offset = max(0, int(offset))
        page = packets[offset : offset + limit]
        return {
            "session_id": session.session_id,
            "total": total,
            "returned": len(page),
            "offset": offset,
            "limit": limit,
            "packets": [p.to_row() for p in page],
        }

    def get_trace(
        self,
        session_id: str | None = None,
        window: int = 500,
        offset: int = 0,
        apply_rules: list[PriorityRule] | None = None,
    ) -> list[PacketMetadata]:
        session = self._resolve_session(session_id)
        if session is None:
            raise CaptureError("Capture session not found.", 404)
        packets = session.packets
        if not packets:
            raise CaptureError(
                "The selected capture session has no packets yet. Capture some traffic first.", 400
            )
        window = max(1, min(int(window), len(packets)))
        offset = max(0, min(int(offset), max(len(packets) - window, 0)))
        selection = packets[offset : offset + window]
        selection = sorted(selection, key=lambda p: p.timestamp)
        if apply_rules is not None:
            selection = [apply_priority(p, apply_rules) for p in selection]
        return selection

    def clear_history(self, session_id: str | None = None) -> dict:
        settings = get_settings()
        if session_id is None:
            removed = 0
            for session in self._sessions.values():
                removed += len(session.packets)
                session.packets = []
                session.metrics.reset()
            return {"removed": removed, "session_id": None}
        session = self._sessions.get(session_id)
        if session is None:
            raise CaptureError("Capture session not found.", 404)
        removed = len(session.packets)
        session.packets = []
        session.metrics.reset()
        return {"removed": removed, "session_id": session_id, "max_packet_history": settings.max_packet_history}

    def interfaces(self) -> list[dict]:
        return [iface.model_dump() for iface in list_interfaces()]
