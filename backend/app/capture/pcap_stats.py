from __future__ import annotations

import ctypes
from typing import Any


class _PcapStat(ctypes.Structure):
    _fields_ = [
        ("ps_recv", ctypes.c_uint),
        ("ps_drop", ctypes.c_uint),
        ("ps_ifdrop", ctypes.c_uint),
    ]


_lib = None


def _get_lib():
    global _lib
    if _lib is not None:
        return _lib
    for candidate in ("wpcap.dll", "libpcap.so.1", "libpcap.so", "libpcap.dylib"):
        try:
            _lib = ctypes.CDLL(candidate)
            return _lib
        except OSError:
            continue
    return None


def read_pcap_stats(sock: Any) -> tuple[int, int] | None:
    """Return (received, dropped_by_kernel) from the pcap handle if available."""
    if sock is None:
        return None
    fd = getattr(sock, "pcap_fd", None)
    if fd is None:
        return None
    handle = getattr(fd, "pcap", None)
    if handle is None:
        return None
    lib = _get_lib()
    if lib is None or not hasattr(lib, "pcap_stats"):
        return None
    stat = _PcapStat()
    try:
        result = lib.pcap_stats(handle, ctypes.byref(stat))
    except Exception:
        return None
    if result != 0:
        return None
    return int(stat.ps_recv), int(stat.ps_drop)
