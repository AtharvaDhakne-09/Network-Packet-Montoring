from __future__ import annotations

import time
from collections import deque
from dataclasses import asdict, dataclass, field
from typing import Any, Optional

from ..analytics.priority import apply_priority
from ..data_structures.circular_queue import CircularQueue
from ..data_structures.priority_queue import MinHeapPriorityQueue
from ..models.packet import PacketMetadata, PacketPriority
from ..models.settings import PriorityRule

POLICIES = ("fifo", "priority")


@dataclass
class SimulationConfig:
    policy: str = "fifo"
    capacity: int = 32
    rate_mode: str = "pps"
    service_rate: float = 200.0
    link_rate_mbps: float = 100.0
    time_scale: float = 1.0
    priority_rules: list[PriorityRule] = field(default_factory=list)
    default_priority: int = PacketPriority.NORMAL
    session_id: str | None = None
    window: int = 500
    offset: int = 0
    label: str = ""

    def validate(self) -> None:
        if self.policy not in POLICIES:
            raise ValueError("policy must be 'fifo' or 'priority'")
        if not isinstance(self.capacity, int) or not (2 <= self.capacity <= 4096):
            raise ValueError("capacity must be between 2 and 4096")
        if self.rate_mode not in ("pps", "bps"):
            raise ValueError("rate_mode must be 'pps' or 'bps'")
        if self.service_rate <= 0:
            raise ValueError("service_rate must be positive")
        if self.link_rate_mbps <= 0:
            raise ValueError("link_rate_mbps must be positive")
        if self.time_scale < 0:
            raise ValueError("time_scale must be zero (max speed) or positive")

    def to_dict(self) -> dict:
        data = asdict(self)
        data["priority_rules"] = [rule.model_dump() for rule in self.priority_rules]
        return data


@dataclass
class SimulationStats:
    offered: int = 0
    accepted: int = 0
    dropped: int = 0
    processed: int = 0
    processed_bytes: int = 0
    waiting_sum: float = 0.0
    waiting_max: float = 0.0
    peak_queue: int = 0
    occupancy_area: float = 0.0
    busy_area: float = 0.0


class RouterSimulation:
    def __init__(self, trace: list[PacketMetadata], config: SimulationConfig, sim_id: str = "") -> None:
        config.validate()
        ordered = sorted(trace, key=lambda p: p.timestamp)
        self.sim_id = sim_id
        self.config = config
        self.trace: list[PacketMetadata] = [
            apply_priority(p, config.priority_rules, config.default_priority) for p in ordered
        ]
        self.t0 = self.trace[0].timestamp if self.trace else 0.0
        if config.policy == "fifo":
            self.queue: Any = CircularQueue(config.capacity)
        else:
            self.queue = MinHeapPriorityQueue(
                config.capacity, priority_of=lambda p: p.priority
            )
        self.stats = SimulationStats()
        self.sim_time = 0.0
        self.next_index = 0
        self.current: Optional[PacketMetadata] = None
        self.current_start = 0.0
        self.server_busy_until = 0.0
        self.finished = len(self.trace) == 0
        self.finish_time = 0.0
        self._enqueue_time: dict[str, float] = {}
        self.events: deque[dict] = deque(maxlen=400)
        self.started_at = time.time()

    def arrival_time(self, index: int) -> float:
        return self.trace[index].timestamp - self.t0

    def service_time(self, packet: PacketMetadata) -> float:
        if self.config.rate_mode == "pps":
            return 1.0 / self.config.service_rate
        bits = max(packet.length, 1) * 8
        return bits / (self.config.link_rate_mbps * 1_000_000.0)

    def _advance_time(self, target: float) -> None:
        dt = target - self.sim_time
        if dt > 0:
            self.stats.occupancy_area += self.queue.get_size() * dt
            if self.current is not None:
                self.stats.busy_area += dt
            self.sim_time = target

    def next_event_time(self) -> float:
        t_arrival = float("inf")
        if self.next_index < len(self.trace):
            t_arrival = self.arrival_time(self.next_index)
        t_depart = float("inf")
        if self.current is not None:
            t_depart = self.server_busy_until
        return min(t_arrival, t_depart)

    def step(self) -> Optional[dict]:
        if self.finished:
            return None
        t_arrival = float("inf")
        if self.next_index < len(self.trace):
            t_arrival = self.arrival_time(self.next_index)
        t_depart = self.server_busy_until if self.current is not None else float("inf")
        target = min(t_arrival, t_depart)
        if target == float("inf"):
            self._finish()
            return None
        self._advance_time(max(target, self.sim_time))

        event: Optional[dict] = None
        if t_arrival <= t_depart:
            event = self._offer(self.next_index)
            self.next_index += 1
        else:
            event = self._complete()
        self._maybe_start_service()
        if self.next_index >= len(self.trace) and self.current is None and self.queue.is_empty():
            self._finish()
        return event

    def _offer(self, index: int) -> dict:
        packet = self.trace[index]
        self.stats.offered += 1
        arrival = self.sim_time
        priority = getattr(packet, "priority", PacketPriority.NORMAL)
        if self.queue.is_full():
            self.stats.dropped += 1
            event = {
                "type": "drop",
                "event_id": packet.event_id,
                "priority": priority,
                "classification": packet.classification,
                "time": arrival,
                "reason": "buffer full (drop-tail)",
                "queue_size": self.queue.get_size(),
            }
        else:
            self.queue.enqueue(packet)
            self._enqueue_time[packet.event_id] = arrival
            self.stats.accepted += 1
            self.stats.peak_queue = max(self.stats.peak_queue, self.queue.get_size())
            event = {
                "type": "offer",
                "event_id": packet.event_id,
                "priority": priority,
                "classification": packet.classification,
                "time": arrival,
                "accepted": True,
                "queue_size": self.queue.get_size(),
            }
        self.events.append(event)
        return event

    def _complete(self) -> dict:
        packet = self.current
        assert packet is not None
        enqueue_time = self._enqueue_time.pop(packet.event_id, self.current_start)
        waiting = max(self.current_start - enqueue_time, 0.0)
        self.stats.processed += 1
        self.stats.processed_bytes += packet.length
        self.stats.waiting_sum += waiting
        self.stats.waiting_max = max(self.stats.waiting_max, waiting)
        event = {
            "type": "complete",
            "event_id": packet.event_id,
            "priority": getattr(packet, "priority", PacketPriority.NORMAL),
            "time": self.sim_time,
            "waiting_seconds": round(waiting, 6),
            "service_seconds": round(self.server_busy_until - self.current_start, 6),
            "length": packet.length,
            "queue_size": self.queue.get_size(),
        }
        self.current = None
        self.events.append(event)
        return event

    def _maybe_start_service(self) -> None:
        if self.current is not None or self._is_done():
            return
        packet = self.queue.dequeue()
        if packet is None:
            return
        self.current = packet
        self.current_start = self.sim_time
        self.server_busy_until = self.sim_time + self.service_time(packet)
        self.events.append(
            {
                "type": "start",
                "event_id": packet.event_id,
                "priority": getattr(packet, "priority", PacketPriority.NORMAL),
                "time": self.sim_time,
                "queue_size": self.queue.get_size(),
            }
        )

    def _is_done(self) -> bool:
        return self.next_index >= len(self.trace) and self.current is None and self.queue.is_empty()

    def _finish(self) -> None:
        self.finished = True
        self.finish_time = self.sim_time

    def run_to_completion(self, max_steps: int = 2_000_000) -> None:
        steps = 0
        while not self.finished and steps < max_steps:
            self.step()
            steps += 1

    def metrics(self) -> dict:
        span = max(self.sim_time, 1e-9)
        processed = self.stats.processed
        avg_wait = (self.stats.waiting_sum / processed) if processed else 0.0
        drop_rate = (self.stats.dropped / self.stats.offered * 100.0) if self.stats.offered else 0.0
        return {
            "policy": self.config.policy,
            "offered_packets": self.stats.offered,
            "accepted_packets": self.stats.accepted,
            "processed_packets": processed,
            "dropped_packets": self.stats.dropped,
            "drop_rate_percent": round(drop_rate, 2),
            "still_waiting_packets": self.queue.get_size(),
            "in_service_packets": 1 if self.current is not None else 0,
            "average_wait_seconds": round(avg_wait, 6),
            "max_wait_seconds": round(self.stats.waiting_max, 6),
            "packet_throughput_pps": round(processed / span, 3),
            "byte_throughput_bps": round(self.stats.processed_bytes / span, 2),
            "processed_bytes": self.stats.processed_bytes,
            "peak_buffer_utilization_percent": round(
                self.stats.peak_queue / self.config.capacity * 100.0, 2
            ),
            "average_buffer_occupancy": round(self.stats.occupancy_area / span, 3),
            "peak_buffer_occupancy": self.stats.peak_queue,
            "buffer_capacity": self.config.capacity,
            "server_utilization_percent": round(self.stats.busy_area / span * 100.0, 2),
            "sim_duration_seconds": round(self.sim_time, 6),
            "accounting_balanced": self.stats.offered
            == self.stats.accepted + self.stats.dropped + 0,
        }

    def trace_summary(self) -> dict:
        return {
            "packets": len(self.trace),
            "first_timestamp": self.t0,
            "last_timestamp": self.trace[-1].timestamp if self.trace else None,
        }

    def snapshot(self, event_limit: int = 60) -> dict:
        events = list(self.events)[-event_limit:]
        return {
            "sim_id": self.sim_id,
            "config": self.config.to_dict(),
            "state": "finished" if self.finished else "running",
            "progress": {
                "offered": self.stats.offered,
                "total": len(self.trace),
                "sim_time": round(self.sim_time, 6),
                "finished": self.finished,
            },
            "metrics": self.metrics(),
            "queue": self.queue.snapshot(),
            "current_packet": self.current.to_row() if self.current is not None else None,
            "events": events,
            "trace": self.trace_summary(),
        }


def compare_policies(
    trace: list[PacketMetadata],
    config: SimulationConfig,
) -> dict:
    results = {}
    for policy in POLICIES:
        cfg = SimulationConfig(
            **{
                **asdict(config),
                "policy": policy,
                "priority_rules": list(config.priority_rules),
            }
        )
        engine = RouterSimulation(trace, cfg)
        engine.run_to_completion()
        results[policy] = engine.metrics()
    return {
        "trace": {
            "packets": len(trace),
            "capacity": config.capacity,
            "rate_mode": config.rate_mode,
            "service_rate": config.service_rate,
            "link_rate_mbps": config.link_rate_mbps,
        },
        "fifo": results["fifo"],
        "priority": results["priority"],
        "explanation": explain_comparison(results["fifo"], results["priority"]),
    }


def explain_comparison(fifo: dict, priority: dict) -> list[str]:
    lines: list[str] = []

    def delta(key: str) -> float:
        return priority.get(key, 0.0) - fifo.get(key, 0.0)

    d_drop = delta("drop_rate_percent")
    if abs(d_drop) < 0.01:
        lines.append("Both policies dropped a nearly identical share of offered packets on this trace.")
    elif d_drop < 0:
        lines.append(
            f"Priority scheduling reduced the simulated drop rate by {abs(d_drop):.2f} percentage points "
            f"({fifo['drop_rate_percent']:.2f}% FIFO vs {priority['drop_rate_percent']:.2f}% priority) by draining selected classes earlier."
        )
    else:
        lines.append(
            f"Priority scheduling increased the simulated drop rate by {d_drop:.2f} percentage points on this trace, "
            "because lower-priority classes can be admitted ahead of others and occupy the buffer earlier."
        )

    d_peak = delta("peak_buffer_utilization_percent")
    if abs(d_peak) < 0.5:
        lines.append("Peak buffer utilization was essentially unchanged between the two policies.")
    elif d_peak > 0:
        lines.append(f"Priority scheduling reached a {d_peak:.2f} percentage point higher peak buffer utilization.")
    else:
        lines.append(f"Priority scheduling reached a {abs(d_peak):.2f} percentage point lower peak buffer utilization.")

    d_avg_wait = delta("average_wait_seconds")
    if abs(d_avg_wait) < 1e-6:
        lines.append("Average queue waiting time was effectively identical across policies.")
    elif d_avg_wait < 0:
        lines.append(
            f"Priority scheduling lowered average queue waiting time by {abs(d_avg_wait) * 1000:.3f} ms for processed packets."
        )
    else:
        lines.append(
            f"Priority scheduling raised average queue waiting time by {d_avg_wait * 1000:.3f} ms for processed packets."
        )

    d_tp = delta("packet_throughput_pps")
    if abs(d_tp) < 1e-3:
        lines.append("Packet throughput matched because a single server processes at the same configured rate in both policies.")
    else:
        lines.append(
            f"Packet throughput differed by {d_tp:.3f} packets/s in this run, driven by which packets were admitted before drops."
        )

    d_occ = delta("average_buffer_occupancy")
    if abs(d_occ) < 1e-3:
        lines.append("Average buffer occupancy was comparable under both policies.")
    else:
        direction = "greater" if d_occ > 0 else "lower"
        lines.append(f"Average buffer occupancy was {abs(d_occ):.3f} packets {direction} under priority scheduling.")

    lines.append(
        "Neither policy is universally better: outcomes depend on the captured traffic mix, the configured capacity, "
        "and the processing rate. Re-run the comparison on a different capture window to confirm."
    )
    return lines
