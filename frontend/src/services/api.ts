import type {
  AppSettings,
  CaptureStatus,
  ComparisonResult,
  InterfaceInfo,
  MetricsSnapshot,
  PacketQueryResult,
  PriorityRule,
  SettingsResponse,
  SimulationConfig,
  SimulationState,
} from "../types";

export const API_BASE = (import.meta.env?.VITE_API_BASE as string) ?? "http://127.0.0.1:8000";
export const WS_BASE = API_BASE.replace(/^http/, "ws");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
  } catch (error) {
    throw new ApiError(
      "Cannot reach the backend at " + API_BASE + ". Start it with uvicorn app.main:app --host 127.0.0.1 --port 8000.",
      0,
    );
  }
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) {
    const detail =
      body && typeof body === "object" && "detail" in body
        ? formatDetail((body as { detail: unknown }).detail)
        : `Request failed with status ${response.status}`;
    throw new ApiError(detail, response.status);
  }
  return body as T;
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (item && typeof item === "object" && "msg" in item ? String((item as { msg: unknown }).msg) : String(item)))
      .join("; ");
  }
  return JSON.stringify(detail);
}

export const api = {
  health: () => request<Record<string, unknown>>("/api/health"),
  interfaces: () => request<{ interfaces: InterfaceInfo[]; count: number }>("/api/interfaces"),

  startCapture: (payload: {
    interface_id: string;
    filter?: string;
    max_packets?: number;
    max_duration?: number;
    priority_rules?: PriorityRule[];
  }) => request<{ session: CaptureStatus["session"] }>("/api/capture/start", { method: "POST", body: JSON.stringify(payload) }),

  stopCapture: (session_id?: string) =>
    request<{ session: CaptureStatus["session"] }>("/api/capture/stop", {
      method: "POST",
      body: JSON.stringify({ session_id: session_id ?? null }),
    }),

  captureStatus: (sessionId?: string) =>
    request<CaptureStatus>(`/api/capture/status${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`),

  sessions: () => request<{ sessions: CaptureStatus["session"][]; count: number }>("/api/capture/sessions"),

  packets: (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
    });
    return request<PacketQueryResult>(`/api/capture/packets?${query.toString()}`);
  },

  metrics: (sessionId?: string) =>
    request<{ metrics: MetricsSnapshot | null; session_id: string | null; message?: string }>(
      `/api/capture/metrics${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`,
    ),

  setFilter: (filter: string, session_id?: string) =>
    request<{ session: CaptureStatus["session"] }>("/api/capture/filter", {
      method: "POST",
      body: JSON.stringify({ filter, session_id: session_id ?? null }),
    }),

  clearHistory: (sessionId?: string) =>
    request<{ removed: number; session_id: string | null }>(
      `/api/capture/history${sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : ""}`,
      { method: "DELETE" },
    ),

  simulationStart: (payload: Partial<SimulationConfig>) =>
    request<SimulationState>("/api/simulation/start", { method: "POST", body: JSON.stringify(payload) }),

  simulationState: (simId?: string) =>
    request<SimulationState>(`/api/simulation/state${simId ? `?sim_id=${encodeURIComponent(simId)}` : ""}`),

  simulationRuns: () => request<{ runs: SimulationState[]; count: number }>("/api/simulation/runs"),

  simulationPause: (simId?: string) =>
    request<SimulationState>("/api/simulation/pause", { method: "POST", body: JSON.stringify({ sim_id: simId ?? null }) }),
  simulationResume: (simId?: string) =>
    request<SimulationState>("/api/simulation/resume", { method: "POST", body: JSON.stringify({ sim_id: simId ?? null }) }),
  simulationStep: (simId?: string) =>
    request<SimulationState>("/api/simulation/step", { method: "POST", body: JSON.stringify({ sim_id: simId ?? null }) }),
  simulationReset: (simId?: string) =>
    request<SimulationState>("/api/simulation/reset", { method: "POST", body: JSON.stringify({ sim_id: simId ?? null }) }),
  simulationStop: (simId?: string) =>
    request<SimulationState>("/api/simulation/stop", { method: "POST", body: JSON.stringify({ sim_id: simId ?? null }) }),

  compare: (payload: Record<string, unknown>) =>
    request<ComparisonResult>("/api/simulation/compare", { method: "POST", body: JSON.stringify(payload) }),

  settings: () => request<SettingsResponse>("/api/settings"),
  updateSettings: (settings: AppSettings) =>
    request<{ settings: AppSettings }>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }),
  resetSettings: () => request<{ settings: AppSettings }>("/api/settings/reset", { method: "POST" }),
};
