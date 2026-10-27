from scapy.layers.inet import ICMP, IP, TCP, UDP
from scapy.layers.inet6 import IPv6
from scapy.layers.l2 import ARP, Ether
from scapy.packet import Raw

from app.analytics.priority import classify_priority
from app.capture.metadata import parse_packet
from app.models.settings import PriorityRule


def test_ipv4_tcp_metadata():
    pkt = Ether() / IP(src="192.168.1.10", dst="93.184.216.34") / TCP(sport=51000, dport=443, flags="SA")
    meta = parse_packet(pkt, "s1", "Wi-Fi")
    assert meta is not None
    assert meta.protocol == "TCP"
    assert meta.ip_version == 4
    assert meta.src_ip == "192.168.1.10"
    assert meta.dst_ip == "93.184.216.34"
    assert meta.src_port == 51000
    assert meta.dst_port == 443
    assert meta.tcp_flags == "SYN, ACK"
    assert meta.classification == "HTTPS/TLS"
    assert meta.interface == "Wi-Fi"
    assert meta.direction is None
    assert meta.event_id
    assert meta.flow_id and meta.flow_id.startswith("tcp-")


def test_udp_dns_metadata():
    pkt = Ether() / IP(src="10.0.0.5", dst="8.8.8.8") / UDP(sport=5555, dport=53)
    meta = parse_packet(pkt, "s1", "Wi-Fi")
    assert meta.protocol == "UDP"
    assert meta.dst_port == 53
    assert meta.classification == "DNS"
    assert meta.tcp_flags is None


def test_ipv6_udp_metadata():
    pkt = Ether() / IPv6(src="fe80::1", dst="ff02::1") / UDP(sport=546, dport=547)
    meta = parse_packet(pkt, "s1", "Wi-Fi")
    assert meta.protocol == "UDP"
    assert meta.ip_version == 6
    assert meta.src_ip == "fe80::1"


def test_icmp_metadata():
    pkt = Ether() / IP(src="10.0.0.1", dst="10.0.0.1") / ICMP()
    meta = parse_packet(pkt, "s1", "Wi-Fi")
    assert meta.protocol == "ICMP"
    assert meta.src_port is None
    assert meta.dst_port is None


def test_arp_has_no_ip_addresses():
    pkt = Ether() / ARP()
    meta = parse_packet(pkt, "s1", "Ethernet")
    assert meta.protocol == "ARP"
    assert meta.ip_version is None
    assert meta.src_ip is None
    assert meta.dst_ip is None
    assert meta.tcp_flags is None


def test_non_ip_frame():
    pkt = Ether() / Raw(b"\x01\x02\x03\x04")
    meta = parse_packet(pkt, "s1", "Ethernet")
    assert meta.protocol == "Non-IP"
    assert meta.ip_version is None
    assert meta.length > 0


def test_length_uses_wirelen_when_available():
    pkt = Ether() / IP() / TCP() / Raw(b"x" * 20)
    meta = parse_packet(pkt, "s1", "Wi-Fi")
    assert meta.length == len(bytes(pkt))


def test_priority_rules_applied_during_parse():
    rules = [PriorityRule(match="dst_port", value="53", priority=1, label="DNS")]
    pkt = Ether() / IP(src="10.1.1.1", dst="10.1.1.2") / UDP(sport=1, dport=53)
    meta = parse_packet(pkt, "s1", "Wi-Fi", rules)
    assert meta.priority == 1
    assert meta.priority_reason == "DNS"


def test_classify_priority_port_and_protocol():
    rules = [
        PriorityRule(match="protocol", value="icmp", priority=2),
        PriorityRule(match="dst_port", value="443", priority=4),
    ]
    from tests.conftest import make_packet

    icmp = make_packet(protocol="ICMP")
    assert classify_priority(icmp, rules)[0] == 2
    https = make_packet(protocol="TCP", dst_port=443)
    assert classify_priority(https, rules) == (4, "rule dst_port=443")
    unrelated = make_packet(protocol="TCP", dst_port=9999)
    assert classify_priority(unrelated, rules)[0] == 3
