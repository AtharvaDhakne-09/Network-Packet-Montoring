from __future__ import annotations

from ..models.packet import PacketMetadata, PacketPriority
from ..models.settings import PriorityRule


def _rule_matches(rule: PriorityRule, packet: PacketMetadata) -> bool:
    value = rule.value.strip().lower()
    if rule.match == "any":
        return True
    if rule.match == "protocol":
        return packet.protocol.lower() == value
    if rule.match == "classification":
        return packet.classification.lower() == value
    if rule.match in ("dst_port", "src_port", "port"):
        if not value.isdigit():
            return False
        port = int(value)
        if rule.match == "dst_port":
            return packet.dst_port == port
        if rule.match == "src_port":
            return packet.src_port == port
        return packet.src_port == port or packet.dst_port == port
    return False


def classify_priority(
    packet: PacketMetadata,
    rules: list[PriorityRule] | None,
    default: int = PacketPriority.NORMAL,
) -> tuple[int, str]:
    if rules:
        for rule in rules:
            if not rule.enabled:
                continue
            if _rule_matches(rule, packet):
                label = rule.label or f"rule {rule.match}={rule.value}"
                return rule.priority, label
    return default, "default classification"


def apply_priority(
    packet: PacketMetadata,
    rules: list[PriorityRule] | None,
    default: int = PacketPriority.NORMAL,
) -> PacketMetadata:
    if rules:
        for rule in rules:
            if not rule.enabled:
                continue
            if _rule_matches(rule, packet):
                label = rule.label or f"rule {rule.match}={rule.value}"
                return packet.model_copy(update={"priority": rule.priority, "priority_reason": label})
    if packet.priority == PacketPriority.NORMAL and packet.priority_reason == "default classification":
        return packet
    if packet.priority == PacketPriority.NORMAL and default != PacketPriority.NORMAL:
        return packet.model_copy(update={"priority": default})
    return packet
