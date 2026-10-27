# Architecture

This document explains how Network Traffic Lab is put together: the capture pipeline,
the required data structures, the simulation model, and the streaming protocol.

---

## 1. System overview

```
┌───────────────────────────── Windows host ─────────────────────────────┐
│                                                                        │
│   Npcap (wpcap.dll)                                                    │
│        │  raw frames                                                   │
│        ▼                                                               │
│   Scapy L2listen socket ──► AsyncSniffer (capture thread)               │
│        │ callback: parse metadata only                                 │
│        ▼                                                               │
│   thread queue.Queue(20000)  ── backpressure boundary ──┐              │
│                                                          ▼             │
│   asyncio ingest loop ──► CaptureSession.record(CircularQueue) +       │
│                      │     MetricsCollector + CaptureHub.publish       │
│                      ▼                                                 │
│   WebSocket /ws/capture/{id}  (batched frames)                         │
│                                                                        │
│   SimulationManager ──► RouterSimulation (FIFO | priority)             │
│        │                                                               │
│        ▼                                                               │
│   WebSocket /ws/simulation/{id}                                        │
└────────────────────────────────────────────────────────────────────────┘
                                     ▲
                                     │ HTTP + WebSocket
                          React + Vite single-page app
```

Key separation:

- **Capture path** runs one OS-level sniffer thread per session (Scapy `AsyncSniffer`
  over an explicitly opened `conf.L2listen` socket). It never blocks the event loop.
- **Ingest path** is an asyncio task that drains the thread queue into the session's
  bounded storage and pushes to WebSocket subscribers.
- **Simulation path** is entirely separate and CPU-only; it never re-uses sockets.

---

## 2. Capture pipeline

Files: `backend/app/capture/{interfaces,metadata,pcap_stats,session,manager}.py`

1. **Interface discovery** (`interfaces.py`) — lists Windows interfaces via Scapy and
   exposes a stable id, friendly name and addresses. The frontend shows `name` and uses
   the id when starting capture.
2. **Socket open** (`manager._open_socket`) — opens a raw L2 listener:

   ```python
   sock = conf.L2listen(iface=iface, type=ETH_P_ALL, filter=capture_filter or None)
   ```

   Opening the socket explicitly (rather than passing `iface=` to the sniffer) is
   deliberate: it keeps a handle we can later pass to `pcap_stats`, and it lets filter
   changes be validated before committing.
3. **Sniffer** — `AsyncSniffer(opened_socket=sock, prn=callback, store=False)`. `store=False`
   avoids Scapy keeping every packet in memory. The callback runs on Scapy's thread.
4. **Metadata parsing** (`metadata.parse_packet`) — extracts only:

   `event_id, session_id, timestamp, src_ip, dst_ip, src_port, dst_port, protocol,
   length, ip_version, tcp_flags, interface, direction, classification, flow_id,
   priority, priority_reason`

   Payload bytes are never read into the model. `flow_id` is a hash of the 5-tuple.
   Payload-less L2 protocols are normalised (e.g. IGMP/ICMPv6 class names) so the
   `protocol` column stays consistent.
5. **Thread queue** — parsed metadata is put onto `queue.Queue(maxsize=20000)`. If the
   consumer cannot keep up the callback increments a drop counter instead of blocking
   the capture thread (`app_queue_dropped`).
6. **Ingest loop** (`manager._ingest_loop`) — drains the queue with `get_nowait`, writes
   each packet to the session, updates metrics, and publishes to the hub. It sleeps
   `5 ms` when it did work and `20 ms` when idle.
7. **Limits** — sessions stop automatically when `max_packets` or `max_duration` is hit
   (`end_reason = max_packets_reached | max_duration_reached`).
8. **OS statistics** (`pcap_stats.py`) — every second the ingest loop reads libpcap
   counters through ctypes:

   ```python
   stat = pcap_stat()
   ctypes.WinDLL("wpcap.dll").pcap_stats(fd.pcap, ctypes.byref(stat))
   ```

   giving `ps_recv`, `ps_drop`, `ps_ifdrop`. When unavailable the UI marks OS stats as
   not reported rather than inventing numbers.

### Filter changes

`set_filter` validates the BPF expression by opening a throwaway listener, then stops the
current sniffer, closes the socket, opens a new one and restarts. If anything fails the
old filter is restored. An invalid filter surfaces as HTTP 400.

---

## 3. Data structures

Both are written from scratch — no `heapq`, no `collections.deque` as the backing store
for the queue.

### 3.1 `CircularQueue` — `data_structures/circular_queue.py`

Fixed-capacity ring buffer with a preallocated Python list.

| Operation | Complexity | Notes |
| --- | --- | --- |
| `enqueue` | O(1) | `rear = (rear + 1) % capacity` |
| `dequeue` | O(1) | `front = (front + 1) % capacity` |
| `peek` | O(1) | |
| `get_contents` | O(n) | in logical order |
| search | O(n) | |

- Overflow policy: **drop-tail** — when full, the arriving item is rejected and
  `overflow_count` increments. Existing items are never overwritten.
- `underflow_count` tracks dequeue-on-empty attempts.
- `wraparound_count` increments when the rear pointer laps the array.
- `snapshot()` returns the raw cells with roles (`front`, `rear`, `front_rear`, `occupied`,
  `empty`) so the Buffer Inspector can render the physical layout, plus counters and a
  complexity table.

### 3.2 `MinHeapPriorityQueue` — `data_structures/priority_queue.py`

Array-backed binary **min-heap**. Each entry stores `(priority, sequence)`; entries are
ordered lexicographically. Because `sequence` is a monotonically increasing insertion
counter, **ties break FIFO** (stable scheduling), which matches how a real router would
behave within a class.

| Operation | Complexity |
| --- | --- |
| `insert` | O(log n) |
| `extract_min` | O(log n) |
| `peek` | O(1) |
| `snapshot` / `get_tree_nodes` | O(n) |

- Lower numeric priority = higher precedence (`1` = Critical … `4` = Low).
- Bounded like the queue: inserting into a full heap is rejected and counted as overflow.
- `swap_count` counts sift operations for the inspector.
- `get_tree_nodes()` returns parent/left/right indices so the UI can draw the actual heap
  tree (not a re-derived sorted list).
- `priority_order()` returns the heap's contents sorted by key (O(n log n)) purely for
  display.

---

## 4. Priority classification

File: `analytics/priority.py`

A rule is `{match, value, priority, label, enabled}` where `match` is one of
`any | protocol | classification | src_port | dst_port | port`. `classify_priority`
walks rules in order and returns the first enabled match, else the configured default.

`apply_priority` is the simulation-facing variant: it **only overrides priority when a
rule actually matches**, otherwise it preserves the packet's existing priority. This
matters because it lets a caller pre-tag a trace and then compare policies without the
default silently flattening every packet to Normal.

---

## 5. Router simulation model

File: `simulation/engine.py` — class `RouterSimulation`.

It is a **discrete-event, single-server queue**:

- The trace is sorted by capture timestamp and re-based to `t0`.
- Packet `i` arrives at `trace[i].timestamp - t0`.
- The server processes one packet at a time. Service time depends on `rate_mode`:
  - `pps`: `1 / service_rate` (constant per packet).
  - `bps`: `length * 8 / (link_rate_mbps * 1e6)` (size-proportional).
- On arrival:
  - buffer full → **drop-tail** drop event (`type: "drop"`).
  - otherwise enqueue (`type: "offer"`), record enqueue time.
- When the server is idle and the queue is non-empty, it dequeues the next packet:
  - FIFO policy → `CircularQueue` gives front-of-line.
  - Priority policy → `MinHeapPriorityQueue` gives the lowest `(priority, sequence)`.
  - A `type: "start"` event is emitted.
- On completion a `type: "complete"` event is emitted with waiting and service times.

Time advances with `_advance_time`, which accumulates two integrals while the clock moves:

- `occupancy_area += queue_size * dt` → average buffer occupancy.
- `busy_area += dt` while a packet is in service → server utilisation.

Events are buffered in a bounded `deque(maxlen=400)`.

### Metrics (`metrics()`)

| Metric | Definition |
| --- | --- |
| `offered_packets` | arrivals presented to the buffer |
| `accepted_packets` | arrivals that found room |
| `dropped_packets` | arrivals rejected (buffer full) |
| `processed_packets` | packets that completed service |
| `drop_rate_percent` | `dropped / offered * 100` |
| `average_wait_seconds` | `sum(waiting) / processed` |
| `max_wait_seconds` | max waiting seen |
| `packet_throughput_pps` | `processed / sim_time` |
| `byte_throughput_bps` | `processed_bytes / sim_time` |
| `peak_buffer_utilization_percent` | `peak_queue / capacity * 100` |
| `average_buffer_occupancy` | `occupancy_area / sim_time` |
| `server_utilization_percent` | `busy_area / sim_time * 100` |
| `accounting_balanced` | `offered == accepted + dropped` |

**Accounting invariant:** every offered packet is either accepted or dropped, and every
accepted packet is eventually processed (or still queued/in service when the run ends).
Exactly one policy is applied per run, so FIFO and priority share identical arrivals.

### Policy comparison (`compare_policies`)

`compare_policies` runs the *same* trace through two independent engines — one `fifo`,
one `priority` — with identical capacity and rate settings, and returns both metric
sets plus `explain_comparison(...)`, which generates a natural-language summary from the
**measured** deltas (drop rate, peak utilisation, average wait, throughput, occupancy).

Crucially, the explanation never claims priority is better a priori:

- It reports whichever policy actually reduced drop rate / wait on this trace, or says
  they were ~equal.
- It acknowledges cases where priority *increases* drops (an admitted low-priority
  packet can occupy the buffer ahead of others).
- It always ends by stating that neither policy is universally better and that results
  depend on traffic mix, capacity and rate.

### Run control (`simulation/manager.py`)

`SimulationManager` wraps a `RouterSimulation` for interactive control:

- `start` builds the engine from a captured window, `pause`/`resume` gate stepping.
- `step` advances a fixed number of engine steps (fed by `step_credits`).
- `reset` restarts from the same trace; `stop` finalises.
- A background task replays according to `time_scale` (0 = as fast as possible) and
  publishes `snapshot()` frames to the simulation hub.

---

## 6. Analytics

File: `analytics/metrics.py` — `MetricsCollector` keeps one-second buckets for
throughput, plus running histograms (packet length), protocol counts, per-IP talker
counts and port/service breakdowns. `snapshot()` returns bounded top-N lists so payload
size stays predictable regardless of traffic volume.

---

## 7. Streaming protocol

`websocket/hub.py` + `api/routes_ws.py`.

- Each client is a `WsSubscriber` with a bounded `asyncio.Queue`.
- **Capture** frames are **batched**: up to `batch_size` packets per frame, flushed at
  least every `interval` seconds. Batch size/interval can be tuned at runtime with a
  `set_stream` message. All sends share one lock so heartbeat and batch frames never
  interleave mid-message.
- **Simulation** frames use `drop_oldest=True` on a small queue — for a live visualiser
  the newest state matters more than the oldest.
- A slow client (queue full repeatedly) is flagged `slow_client` and stops being an
  unbounded liability; drops are counted, never hidden.

### Capture WebSocket message types

| Type | Payload |
| --- | --- |
| `hello` | session, metrics, batch config |
| `packets` | `packets[]`, metrics, session, client stats |
| `metrics` | periodic 1 s heartbeat with metrics + session |
| `pong` | reply to client `ping` |
| `error` | unknown session; socket closed with code 4004 |

Client → server: `{"type":"ping"}` and `{"type":"set_stream","batch_size":…,"interval":…}`.

### Simulation WebSocket message types

`state` frames (initial + 1 s heartbeat + event batches) carrying `config`, `state`,
`progress`, `metrics`, `queue` snapshot, `current_packet`, `events`.

---

## 8. Settings & persistence

`config.py` + `models/settings.py`. Settings are a Pydantic model persisted to
`backend/data/settings.json` (created on first save). They cover capture limits,
interface refresh cadence, simulation defaults and priority rules. `/api/settings`
provides GET/PUT/reset; the frontend validates inputs against the published bounds before
saving. If the file is missing or corrupt, defaults are used.

---

## 9. Honesty & limitations

- **Real vs simulated.** Live capture is real. Buffer behaviour, drops, delays and
  policy comparison are a model and are labelled as such everywhere in the UI.
- **Single server.** The model is one processing element, not a full router with
  multiple egress queues or scheduling between interfaces.
- **No payload analysis / reassembly.** Only per-packet metadata; no flows are
  reconstructed and no payload is inspected.
- **Direction is not inferred.** `direction` stays `null` unless it can be set reliably,
  rather than guessing.
- **Windows-first.** Interface listing and `pcap_stats` target the Windows Npcap
  behaviour; other platforms are untested here.
- **OS drop counters** are best-effort and marked unavailable when the platform does not
  expose them.
