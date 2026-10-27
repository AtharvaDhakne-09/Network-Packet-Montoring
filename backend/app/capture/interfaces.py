from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class InterfaceInfo(BaseModel):
    id: str
    name: str
    description: str
    network_name: str
    is_up: bool
    is_running: bool
    is_loopback: bool
    is_wireless: bool
    is_connected: bool
    addresses: list[str]
    ipv4: list[str]
    ipv6: list[str]
    mac: str | None = None
    recommended: bool = False


def _attr(obj: Any, name: str, default: Any = None) -> Any:
    try:
        return getattr(obj, name, default)
    except Exception:
        return default


def list_interfaces() -> list[InterfaceInfo]:
    from scapy.all import conf

    interfaces: list[InterfaceInfo] = []
    for iface in conf.ifaces.values():
        flags = str(_attr(iface, "flags", "") or "")
        is_up = "UP" in flags
        is_running = "RUNNING" in flags
        is_loopback = "LOOPBACK" in flags
        is_wireless = "WIRELESS" in flags
        is_disconnected = "DISCONNECTED" in flags
        ips: dict[int, list[str]] = _attr(iface, "ips", {}) or {}
        ipv4 = list(ips.get(4, [])) if isinstance(ips, dict) else []
        ipv6 = list(ips.get(6, [])) if isinstance(ips, dict) else []
        network_name = _attr(iface, "network_name", None) or _attr(iface, "name", "")
        name = _attr(iface, "name", "") or network_name
        description = _attr(iface, "description", "") or name
        mac = _attr(iface, "mac", None)
        recommended = is_up and is_running and not is_loopback and not is_disconnected
        interfaces.append(
            InterfaceInfo(
                id=network_name,
                name=name,
                description=description,
                network_name=network_name,
                is_up=is_up,
                is_running=is_running,
                is_loopback=is_loopback,
                is_wireless=is_wireless,
                is_connected=not is_disconnected,
                addresses=ipv4 + ipv6,
                ipv4=ipv4,
                ipv6=ipv6,
                mac=str(mac) if mac else None,
                recommended=recommended,
            )
        )
    interfaces.sort(key=lambda i: (not i.recommended, i.is_loopback, i.name))
    return interfaces


def get_interface_by_id(interface_id: str) -> Any:
    from scapy.all import conf

    for iface in conf.ifaces.values():
        network_name = _attr(iface, "network_name", None)
        name = _attr(iface, "name", None)
        if interface_id in (network_name, name):
            return iface
    raise KeyError(interface_id)
