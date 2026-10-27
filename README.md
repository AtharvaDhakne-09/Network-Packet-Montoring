# Network Traffic Lab

A local network-traffic monitoring tool that captures **real packets** from your own
machine, extracts packet metadata (never payloads), visualises it in a React dashboard,
and replays captured traffic through a configurable **router buffer simulation** that
compares a FIFO circular queue against a priority min-heap.

The capture side is real. The router side is an explicitly-labelled simulation — no real
packets are delayed, reordered or dropped by this application.

---

## What it does

| Area | Description |
| --- | --- |
| **Live capture** | Attaches to a chosen Windows interface with Npcap + Scapy, streams metadata over WebSocket to the browser. |
| **Metadata only** | IPs, ports, protocol, length, TCP flags, service classification, flow id, priority. Payload bytes are never stored or transmitted. |
| **Analytics** | Per-second throughput, protocol mix, top talkers, port/service breakdown, length histograms. |
| **Router simulation** | Deterministic event replay of a captured window through a bounded router buffer. |
| **Policy comparison** | The *same* captured window is replayed through FIFO and priority policies so the difference is measured, not asserted. |
| **Required data structures** | Hand-written `CircularQueue` (bounded FIFO) and `MinHeapPriorityQueue` (stable binary min-heap). |
| **History & export** | Server-side paginated packet history, CSV export (metadata only). |

### Pages

1. **Overview** — capture status, interface selector, headline metrics, protocol mix.
2. **Live Monitor** — virtualised live packet list, filters, sort, pause/autoscroll, CSV export, inline detail.
3. **Analytics** — throughput/length charts, top talkers, service and port breakdowns.
4. **Router Simulation** — start/pause/resume/step/reset a replay, live buffer + queue view, timing metrics.
5. **Buffer Inspector** — literal view of the circular buffer cells and the heap tree, plus operation counters and complexity notes.
6. **Policy Comparison** — run FIFO vs priority on an identical trace and see the measured deltas.
7. **History** — searchable/filterable server-side packet history with detail modal and CSV export.
8. **Settings** — capture limits, refresh rates, simulation defaults and priority rules.

---

## Requirements

- **Windows** with [Npcap](https://npcap.com/) installed (WinPcap-compatible mode is fine).
  Live capture uses `wpcap.dll` for interface statistics.
- **Python 3.11+** (developed and verified on Python 3.14).
- **Node 18+** and npm (developed and verified on Node 24 / npm 11).

Live capture generally works without Administrator privileges for normal interfaces, but
some adapters / setups do require running the backend elevated. See Troubleshooting.

---

## Setup

### Backend

```powershell
# from the project root
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

### Frontend

```powershell
cd frontend
npm install
```

---

## Running

Start the backend (from the project root, so the venv is used):

```powershell
.\.venv\Scripts\Activate.ps1
cd backend
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the frontend in a second terminal:

```powershell
cd frontend
npm run dev
```

Open <http://localhost:5173>. Then:

1. Pick an interface on **Overview** (or the header capture controls) and press **Start**.
2. Watch **Live Monitor** and **Analytics** populate.
3. Stop capture, then use **Router Simulation** and **Policy Comparison** to replay the
   captured window through the buffer model.

API base URL: `http://127.0.0.1:8000` · WebSocket base: `ws://127.0.0.1:8000`.

Both are defined in `frontend/src/services/api.ts` if you need to change ports.

---

## Tests

### Backend

```powershell
cd backend
python -m pytest -q
```

The live-capture tests are skipped by default because they need Npcap and a real
interface. To run them:

```powershell
$env:NTL_LIVE_CAPTURE = "1"
python -m pytest tests/test_live_capture.py -q
```

### Frontend

```powershell
cd frontend
npm run typecheck   # tsc --noEmit
npm run test        # vitest run
npm run build       # tsc -b && vite build
```

---

## Project layout

```
backend/
  app/
    data_structures/   CircularQueue, MinHeapPriorityQueue
    capture/           interface listing, metadata extraction, pcap stats, session, manager
    analytics/         metrics collector, priority classification
    simulation/        deterministic replay engine + run manager + comparison
    websocket/         capture & simulation hubs
    api/               health, capture, simulation, settings, websocket routes
    models/            packet, settings, request schemas
    config.py          paths, queue sizes, settings persistence
    main.py            FastAPI app factory
  tests/               pytest suite (conftest builds packet fixtures)
frontend/
  src/
    pages/             8 feature pages
    components/        Layout, CaptureControls, PacketDetail, PriorityRulesEditor, ui primitives
    hooks/             useCapture (global capture context), useSimulation
    services/api.ts     all HTTP/WS calls
    lib/               format, packets, csv, captureState helpers (+ tests)
    types/             shared TypeScript types
docs/
  architecture.md      design notes: DSA, capture pipeline, simulation model
```

---

## Data structures

**`CircularQueue`** (`backend/app/data_structures/circular_queue.py`) — fixed-capacity
ring buffer used for retained packet history and (conceptually) the simulated router
buffer. O(1) enqueue/dequeue, explicit `overwrite`/drop-tail overflow policy, and a
snapshot/trace API used by the Buffer Inspector.

**`MinHeapPriorityQueue`** (`backend/app/data_structures/priority_queue.py`) — array-backed
binary min-heap ordered by `(priority, sequence)`, so equal-priority packets keep FIFO
order (stable). O(log n) push/pop, O(1) peek. Used by the priority policy in the router
simulation.

See `docs/architecture.md` for the full design.

---

## API summary

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Liveness + capability probe. |
| GET | `/api/interfaces` | List capture interfaces. |
| POST | `/api/capture/start` | Start a capture session (interface, filter, limits). |
| POST | `/api/capture/stop` | Stop the active session. |
| GET | `/api/capture/status` | Current state + counters. |
| GET | `/api/capture/sessions` | Retained sessions. |
| GET | `/api/capture/packets` | Paged/filtered/sorted packet history. |
| GET | `/api/capture/metrics` | Aggregated analytics. |
| POST | `/api/capture/filter` | Change the live BPF filter. |
| DELETE | `/api/capture/history` | Clear retained packets for a session. |
| GET/PUT | `/api/settings` | Read/replace settings. |
| POST | `/api/settings/reset` | Restore defaults. |
| POST | `/api/simulation/start` | Start a replay run. |
| GET | `/api/simulation/state` | Current run state / snapshot. |
| POST | `/api/simulation/{pause,resume,step,reset,stop}` | Control the run. |
| GET | `/api/simulation/runs` | Retained runs. |
| POST | `/api/simulation/compare` | Replay identical trace through both policies. |
| WS | `/ws/capture/{session_id}` | Live packet + status stream. |
| WS | `/ws/simulation/{sim_id}` | Live simulation event stream. |

---

## Privacy & safety

- Only metadata is captured and retained; payloads are never stored, logged or sent.
- Capture stays bound to your own interfaces; nothing is transmitted off the machine.
- CSV exports are sanitised against spreadsheet formula injection.
- The router simulation never touches real traffic. Any "drop" is a simulation event and
  is labelled as such in the UI.

---

## Verified status

- Backend: `pytest -q` → **75 passed, 3 skipped** (the skipped ones are the live-capture
  tests, which require Npcap). With `NTL_LIVE_CAPTURE=1` the live tests pass on the test
  machine's Wi-Fi interface.
- Frontend: `npm run typecheck` clean, `npm run test` → **19 passed**, `npm run build` succeeds.

---

## Troubleshooting

- **No interfaces listed** — install Npcap and restart. Confirm `C:\Windows\System32\Npcap\wpcap.dll` exists.
- **Start fails with a permission error** — run the backend terminal as Administrator, or pick a different interface.
- **Invalid filter error (HTTP 400)** — the BPF expression was rejected; the API validates it before applying.
- **Frontend can't reach the API** — ensure the backend is on `127.0.0.1:8000` and open the UI from `localhost`/`127.0.0.1` (CORS allows those origins).
- **`npm run build`/dev fails on esbuild** — if your npm blocks install scripts, approve esbuild's postinstall (`npm rebuild esbuild`).
