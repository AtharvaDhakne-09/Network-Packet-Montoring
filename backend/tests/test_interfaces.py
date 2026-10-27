from app.capture.interfaces import list_interfaces


class _FakeIface:
    def __init__(self, name, network_name, flags, ips, description="desc", mac=None):
        self.name = name
        self.network_name = network_name
        self.flags = flags
        self.ips = ips
        self.description = description
        self.mac = mac


class _FakeIfaces:
    def __init__(self, items):
        self._items = items
        self._map = {}

    def values(self):
        return self._items

    def __iter__(self):
        return iter(self._items)


def test_list_interfaces_shapes_and_sorting(monkeypatch):
    import scapy.all as scapy_all

    items = [
        _FakeIface(
            "Loopback Pseudo-Interface 1",
            r"\Device\NPF_Loopback",
            "LOOPBACK+UP+RUNNING+OK",
            {4: ["127.0.0.1"], 6: ["::1"]},
        ),
        _FakeIface(
            "Wi-Fi",
            r"\Device\NPF_{AAA}",
            "UP+RUNNING+WIRELESS+OK",
            {4: ["192.168.0.5"], 6: ["fe80::1"]},
        ),
        _FakeIface(
            "Ethernet",
            r"\Device\NPF_{BBB}",
            "UP+RUNNING+DISCONNECTED",
            {4: ["169.254.1.1"], 6: []},
        ),
    ]
    monkeypatch.setattr(scapy_all.conf, "ifaces", _FakeIfaces(items))
    result = list_interfaces()
    assert len(result) == 3
    assert result[0].name == "Wi-Fi"
    assert result[0].recommended is True
    assert result[0].ipv4 == ["192.168.0.5"]
    assert result[0].is_wireless is True
    loopback = next(i for i in result if i.is_loopback)
    assert loopback.recommended is False
    disconnected = next(i for i in result if i.name == "Ethernet")
    assert disconnected.is_connected is False


def test_get_interface_by_id_unknown_returns_keyerror(monkeypatch):
    import scapy.all as scapy_all

    from app.capture.interfaces import get_interface_by_id

    monkeypatch.setattr(scapy_all.conf, "ifaces", _FakeIfaces([]))
    try:
        get_interface_by_id("missing")
    except KeyError:
        return
    raise AssertionError("expected KeyError")
