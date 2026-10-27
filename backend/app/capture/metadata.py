from __future__ import annotations

import hashlib
import time
import uuid
from typing import Any

from ..models.packet import PacketMetadata

SERVICE_BY_PORT: dict[int, str] = {
    20: "FTP-Data",
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    25: "SMTP",
    53: "DNS",
    67: "DHCP",
    68: "DHCP",
    69: "TFTP",
    80: "HTTP",
    110: "POP3",
    123: "NTP",
    137: "NetBIOS",
    138: "NetBIOS",
    139: "SMB",
    143: "IMAP",
    161: "SNMP",
    389: "LDAP",
    443: "HTTPS/TLS",
    445: "SMB",
    465: "SMTPS",
    514: "Syslog",
    587: "SMTP",
    631: "IPP",
    993: "IMAPS",
    995: "POP3S",
    1194: "OpenVPN",
    1701: "L2TP",
    1900: "SSDP",
    3306: "MySQL",
    3389: "RDP",
    5353: "mDNS",
    5355: "LLMNR",
    5432: "PostgreSQL",
    6379: "Redis",
    8080: "HTTP-Alt",
    8443: "HTTPS-Alt",
}

TCP_FLAG_NAMES = {
    "F": "FIN",
    "S": "SYN",
    "R": "RST",
    "P": "PSH",
    "A": "ACK",
    "U": "URG",
    "E": "ECE",
    "C": "CWR",
    "N": "NS",
}


def _tcp_flags(pkt: Any) -> str | None:
    from scapy.layers.inet import TCP

    if not pkt.haslayer(TCP):
        return None
    flags = pkt[TCP].flags
    letters = str(flags)
    names = [TCP_FLAG_NAMES.get(letter, letter) for letter in letters]
    return ", ".join(names) if names else None


def _classify_service(protocol: str, src_port: int | None, dst_port: int | None) -> str:
    if protocol not in ("TCP", "UDP", "SCTP"):
        if protocol in ("ICMP", "ICMPv6"):
            return "ICMP control"
        if protocol == "ARP":
            return "ARP resolution"
        return "Unclassified"
    for port in (dst_port, src_port):
        if port is not None and port in SERVICE_BY_PORT:
            return SERVICE_BY_PORT[port]
    if dst_port is not None and dst_port >= 49152:
        return "Ephemeral/Unknown"
    if src_port is not None and src_port >= 49152:
        return "Ephemeral/Unknown"
    return "Unknown service"


def _flow_id(
    protocol: str,
    src_ip: str | None,
    dst_ip: str | None,
    src_port: int | None,
    dst_port: int | None,
) -> str | None:
    if not src_ip or not dst_ip:
        return None
    parts = [protocol, src_ip, str(src_port or "-"), dst_ip, str(dst_port or "-")]
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()
    return f"{protocol.lower()}-{digest[:12]}"


def parse_packet(
    pkt: Any,
    session_id: str,
    interface_name: str,
    priority_rules: list[Any] | None = None,
) -> PacketMetadata | None:
    from scapy.layers.inet import ICMP, IP, TCP, UDP
    from scapy.layers.inet6 import ICMPv6Unknown, IPv6
    from scapy.layers.l2 import ARP

    try:
        ip_version: int | None = None
        ip_layer = None
        if pkt.haslayer(IPv6):
            ip_version = 6
            ip_layer = pkt[IPv6]
        elif pkt.haslayer(IP):
            ip_version = 4
            ip_layer = pkt[IP]

        src_ip: str | None = None
        dst_ip: str | None = None
        if ip_layer is not None:
            src_ip = str(ip_layer.src)
            dst_ip = str(ip_layer.dst)

        protocol = "Non-IP"
        src_port: int | None = None
        dst_port: int | None = None

        if ip_layer is None:
            if pkt.haslayer(ARP):
                protocol = "ARP"
        elif pkt.haslayer(TCP):
            protocol = "TCP"
            src_port = int(pkt[TCP].sport)
            dst_port = int(pkt[TCP].dport)
        elif pkt.haslayer(UDP):
            protocol = "UDP"
            src_port = int(pkt[UDP].sport)
            dst_port = int(pkt[UDP].dport)
        elif pkt.haslayer(ICMP):
            protocol = "ICMP"
        elif ip_version == 6 and (pkt.haslayer(ICMPv6Unknown) or pkt.haslayer("ICMPv6ND_NS") or _is_icmpv6(pkt)):
            protocol = "ICMPv6"
        else:
            try:
                payload = ip_layer.payload
                name = payload.__class__.__name__.upper()
                if name.startswith("IGMP"):
                    protocol = "IGMP"
                elif name.startswith("ICMPV6") or name.startswith("ICMP6"):
                    protocol = "ICMPv6"
                else:
                    protocol = name if name else "Other-IP"
            except Exception:
                protocol = "Other-IP"

        length = _packet_length(pkt)
        timestamp = _packet_timestamp(pkt)

        meta = PacketMetadata(
            event_id=uuid.uuid4().hex[:16],
            session_id=session_id,
            timestamp=timestamp,
            src_ip=src_ip,
            dst_ip=dst_ip,
            src_port=src_port,
            dst_port=dst_port,
            protocol=protocol,
            length=length,
            ip_version=ip_version,
            tcp_flags=_tcp_flags(pkt),
            interface=interface_name,
            direction=None,
            classification=_classify_service(protocol, src_port, dst_port),
            flow_id=_flow_id(protocol, src_ip, dst_ip, src_port, dst_port),
        )

        if priority_rules:
            from ..analytics.priority import apply_priority

            meta = apply_priority(meta, priority_rules)
        return meta
    except Exception:
        return None


def _is_icmpv6(pkt: Any) -> bool:
    try:
        from scapy.layers.inet6 import ICMPv6Unknown

        if pkt.haslayer(ICMPv6Unknown):
            return True
        layer = pkt.getlayer("IPv6")
        if layer is None:
            return False
        return layer.nh == 58
    except Exception:
        return False


def _packet_length(pkt: Any) -> int:
    try:
        wirelen = getattr(pkt, "wirelen", None)
        if wirelen:
            return int(wirelen)
    except Exception:
        pass
    try:
        return len(bytes(pkt))
    except Exception:
        return 0


def _packet_timestamp(pkt: Any) -> float:
    try:
        value = float(pkt.time)
        if value > 0:
            return value
    except Exception:
        pass
    return time.time()
