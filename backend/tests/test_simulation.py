import pytest

from app.models.settings import PriorityRule
from app.simulation import SimulationConfig, RouterSimulation, run_comparison
from app.simulation.manager import SimulationError


def build_trace(packet_factory, count=6, spacing=0.0, priorities=None, start=1000.0):
    trace = []
    for i in range(count):
        priority = priorities[i] if priorities else 3
        trace.append(
            packet_factory(
                event_id=f"p{i}",
                timestamp=start + i * spacing,
                priority=priority,
                length=100 + i,
            )
        )
    return trace


def test_offered_accounting_identity(packet_factory):
    trace = build_trace(packet_factory, count=10, spacing=0.0)
    config = SimulationConfig(policy="fifo", capacity=4, service_rate=1.0)
    engine = RouterSimulation(trace, config)
    engine.run_to_completion()
    metrics = engine.metrics()
    assert metrics["offered_packets"] == 10
    assert metrics["accepted_packets"] + metrics["dropped_packets"] == metrics["offered_packets"]
    assert metrics["processed_packets"] == metrics["accepted_packets"]
    assert metrics["still_waiting_packets"] == 0
    assert metrics["in_service_packets"] == 0
    assert metrics["accounting_balanced"] is True


def test_fifo_drop_tail_behaviour(packet_factory):
    trace = build_trace(packet_factory, count=6, spacing=0.0)
    config = SimulationConfig(policy="fifo", capacity=4, service_rate=1.0)
    engine = RouterSimulation(trace, config)
    engine.run_to_completion()
    metrics = engine.metrics()
    assert metrics["accepted_packets"] == 5
    assert metrics["dropped_packets"] == 1
    assert metrics["drop_rate_percent"] == pytest.approx(16.67, abs=0.01)


def test_waiting_times_are_non_negative(packet_factory):
    trace = build_trace(packet_factory, count=8, spacing=0.1)
    config = SimulationConfig(policy="fifo", capacity=8, service_rate=5.0)
    engine = RouterSimulation(trace, config)
    engine.run_to_completion()
    metrics = engine.metrics()
    assert metrics["average_wait_seconds"] >= 0.0
    assert metrics["max_wait_seconds"] >= metrics["average_wait_seconds"]
    for event in engine.events:
        if event["type"] == "complete":
            assert event["waiting_seconds"] >= 0.0


def test_priority_extraction_order(packet_factory):
    priorities = [4, 3, 2, 1]
    trace = build_trace(packet_factory, count=4, spacing=0.0, priorities=priorities)
    config = SimulationConfig(policy="priority", capacity=4, service_rate=1.0)
    engine = RouterSimulation(trace, config)
    completed = []
    while not engine.finished:
        event = engine.step()
        if event and event["type"] == "complete":
            completed.append(event["event_id"])
    assert completed == ["p0", "p3", "p2", "p1"]


def test_priority_rules_reclassify_traffic(packet_factory):
    rules = [PriorityRule(match="dst_port", value="53", priority=1, label="DNS")]
    trace = [
        packet_factory(event_id="bulk1", timestamp=1000.0, priority=3, dst_port=443),
        packet_factory(event_id="bulk2", timestamp=1000.0, priority=3, dst_port=443),
        packet_factory(event_id="dns", timestamp=1000.0, priority=3, dst_port=53),
    ]
    config = SimulationConfig(policy="priority", capacity=4, service_rate=1.0, priority_rules=rules)
    engine = RouterSimulation(trace, config)
    completed = []
    while not engine.finished:
        event = engine.step()
        if event and event["type"] == "complete":
            completed.append(event["event_id"])
    assert completed == ["bulk1", "dns", "bulk2"]


def test_buffer_occupancy_and_peak(packet_factory):
    trace = build_trace(packet_factory, count=6, spacing=0.0)
    config = SimulationConfig(policy="fifo", capacity=6, service_rate=1.0)
    engine = RouterSimulation(trace, config)
    engine.run_to_completion()
    metrics = engine.metrics()
    assert metrics["peak_buffer_occupancy"] == 5
    assert metrics["peak_buffer_utilization_percent"] == pytest.approx(83.33, abs=0.1)
    assert metrics["average_buffer_occupancy"] > 0


def test_byte_rate_mode(packet_factory):
    trace = build_trace(packet_factory, count=3, spacing=0.0)
    config = SimulationConfig(policy="fifo", capacity=8, rate_mode="bps", link_rate_mbps=1.0)
    engine = RouterSimulation(trace, config)
    engine.run_to_completion()
    metrics = engine.metrics()
    assert metrics["processed_packets"] == 3
    assert metrics["processed_bytes"] > 0


def test_comparison_is_deterministic_and_same_trace(packet_factory):
    trace = build_trace(packet_factory, count=12, spacing=0.0, priorities=[i % 4 + 1 for i in range(12)])
    config = SimulationConfig(policy="fifo", capacity=4, service_rate=1.0)
    first = run_comparison(trace, config)
    second = run_comparison(trace, config)
    assert first["fifo"] == second["fifo"]
    assert first["priority"] == second["priority"]
    assert first["fifo"]["offered_packets"] == first["priority"]["offered_packets"] == 12
    assert isinstance(first["explanation"], list) and first["explanation"]


def test_priority_differs_from_fifo_with_mixed_priorities(packet_factory):
    trace = build_trace(packet_factory, count=8, spacing=0.0, priorities=[4, 4, 4, 1, 3, 2, 4, 3])
    config = SimulationConfig(policy="fifo", capacity=4, service_rate=1.0)
    result = run_comparison(trace, config)
    assert result["fifo"]["processed_packets"] == result["priority"]["processed_packets"]
    fifo_order = []
    priority_order = []
    for policy, bucket in (("fifo", fifo_order), ("priority", priority_order)):
        engine = RouterSimulation(
            trace, SimulationConfig(policy=policy, capacity=4, service_rate=1.0)
        )
        while not engine.finished:
            event = engine.step()
            if event and event["type"] == "complete":
                bucket.append(event["event_id"])
    assert fifo_order != priority_order
    assert priority_order[0] == "p0"
    assert priority_order[1] == "p3"


def test_empty_trace_errors():
    config = SimulationConfig(policy="fifo", capacity=4)
    with pytest.raises(SimulationError):
        run_comparison([], config)


def test_config_validation():
    with pytest.raises(ValueError):
        SimulationConfig(policy="nope").validate()
    with pytest.raises(ValueError):
        SimulationConfig(capacity=1).validate()
    with pytest.raises(ValueError):
        SimulationConfig(rate_mode="watts").validate()
