import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { API_BASE, WS_BASE, api, ApiError } from "../services/api";
import type {
  AppSettings,
  CaptureSessionInfo,
  CaptureStatus,
  InterfaceInfo,
  MetricsSnapshot,
  PacketMetadata,
  PriorityRule,
  SettingsResponse,
} from "../types";
import { mergePackets } from "../lib/packets";
import { isLiveState } from "../lib/captureState";

export const LIVE_PACKET_BUFFER = 5000;

export type SocketState = "disconnected" | "connecting" | "connected" | "error";

interface StartOptions {
  interfaceId: string;
  filter?: string;
  maxPackets?: number;
  maxDuration?: number;
  priorityRules?: PriorityRule[];
}

interface CaptureContextValue {
  interfaces: InterfaceInfo[];
  interfacesLoading: boolean;
  interfacesError: string | null;
  loadInterfaces: () => Promise<void>;

  status: CaptureStatus;
  metrics: MetricsSnapshot | null;
  packets: PacketMetadata[];
  sessions: CaptureSessionInfo[];
  activeSession: CaptureSessionInfo | null;
  activeSessionId: string | null;

  settings: AppSettings | null;
  settingsMeta: SettingsResponse | null;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  resetSettings: () => Promise<void>;

  socketState: SocketState;
  error: string | null;
  notice: string | null;
  clearError: () => void;
  clearNotice: () => void;

  refreshStatus: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  startCapture: (options: StartOptions) => Promise<void>;
  stopCapture: () => Promise<void>;
  applyFilter: (filter: string) => Promise<void>;
  clearHistory: (sessionId?: string) => Promise<void>;
  clearLocalPackets: () => void;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

const EMPTY_STATUS: CaptureStatus = {
  state: "idle",
  session: null,
  metrics: null,
  hub: { subscribers: 0, streamed_packets: 0, dropped_to_clients: 0, slow_clients: 0 },
};

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [interfacesLoading, setInterfacesLoading] = useState(false);
  const [interfacesError, setInterfacesError] = useState<string | null>(null);
  const [status, setStatus] = useState<CaptureStatus>(EMPTY_STATUS);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [packets, setPackets] = useState<PacketMetadata[]>([]);
  const [sessions, setSessions] = useState<CaptureSessionInfo[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsMeta, setSettingsMeta] = useState<SettingsResponse | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);

  const activeSession = status.session;
  const activeSessionId = activeSession?.session_id ?? null;
  sessionRef.current = activeSessionId;

  const handleError = useCallback((err: unknown) => {
    if (err instanceof ApiError) {
      setError(err.message);
    } else if (err instanceof Error) {
      setError(err.message);
    } else {
      setError(String(err));
    }
  }, []);

  const loadInterfaces = useCallback(async () => {
    setInterfacesLoading(true);
    setInterfacesError(null);
    try {
      const response = await api.interfaces();
      setInterfaces(response.interfaces);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setInterfacesError(message);
      setInterfaces([]);
    } finally {
      setInterfacesLoading(false);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    try {
      const response = await api.captureStatus();
      setStatus(response);
      if (response.metrics) setMetrics(response.metrics);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const refreshSessions = useCallback(async () => {
    try {
      const response = await api.sessions();
      setSessions(response.sessions.filter((session): session is CaptureSessionInfo => session !== null));
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const loadSettings = useCallback(async () => {
    try {
      const response = await api.settings();
      setSettings(response.settings);
      setSettingsMeta(response);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const saveSettings = useCallback(
    async (next: AppSettings) => {
      const response = await api.updateSettings(next);
      setSettings(response.settings);
      setNotice("Settings saved.");
    },
    [],
  );

  const resetSettings = useCallback(async () => {
    const response = await api.resetSettings();
    setSettings(response.settings);
    setNotice("Settings reset to defaults.");
  }, []);

  const refreshMetrics = useCallback(async () => {
    try {
      const response = await api.metrics(sessionRef.current ?? undefined);
      if (response.metrics) setMetrics(response.metrics);
    } catch (err) {
      handleError(err);
    }
  }, [handleError]);

  const startCapture = useCallback(
    async (options: StartOptions) => {
      setError(null);
      setNotice(null);
      try {
        const response = await api.startCapture({
          interface_id: options.interfaceId,
          filter: options.filter ?? "",
          max_packets: options.maxPackets ?? 0,
          max_duration: options.maxDuration ?? 0,
          priority_rules: options.priorityRules ?? settings?.priority_rules ?? [],
        });
        setPackets([]);
        setNotice(`Capture started on ${response.session?.interface_name ?? options.interfaceId}.`);
        await refreshStatus();
        await refreshSessions();
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, refreshSessions, refreshStatus, settings?.priority_rules],
  );

  const stopCapture = useCallback(async () => {
    setError(null);
    try {
      await api.stopCapture(activeSessionId ?? undefined);
      setNotice("Capture stopped.");
      await refreshStatus();
      await refreshSessions();
    } catch (err) {
      handleError(err);
    }
  }, [activeSessionId, handleError, refreshSessions, refreshStatus]);

  const applyFilter = useCallback(
    async (filter: string) => {
      setError(null);
      try {
        await api.setFilter(filter, activeSessionId ?? undefined);
        setNotice(filter ? `Capture filter set to "${filter}".` : "Capture filter cleared.");
        await refreshStatus();
      } catch (err) {
        handleError(err);
      }
    },
    [activeSessionId, handleError, refreshStatus],
  );

  const clearHistory = useCallback(
    async (sessionId?: string) => {
      setError(null);
      try {
        const response = await api.clearHistory(sessionId);
        setPackets([]);
        setNotice(`Cleared ${response.removed} retained packets.`);
        await refreshStatus();
      } catch (err) {
        handleError(err);
      }
    },
    [handleError, refreshStatus],
  );

  const clearLocalPackets = useCallback(() => {
    setPackets([]);
  }, []);

  useEffect(() => {
    void loadInterfaces();
    void loadSettings();
    void refreshStatus();
    void refreshSessions();
  }, [loadInterfaces, loadSettings, refreshSessions, refreshStatus]);

  useEffect(() => {
    if (settingsMeta) return;
    const timer = window.setInterval(() => {
      void loadSettings();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [loadSettings, settingsMeta]);

  const pollInterval = status.state === "running" ? settings?.dashboard_refresh_ms ?? 1500 : 4000;
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshStatus();
      void refreshSessions();
    }, pollInterval);
    return () => window.clearInterval(timer);
  }, [pollInterval, refreshStatus, refreshSessions]);

  useEffect(() => {
    if (!activeSessionId || !isLiveState(status.state)) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setSocketState("disconnected");
      return;
    }

    let disposed = false;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      setSocketState("connecting");
      const socket = new WebSocket(`${WS_BASE}/ws/capture/${activeSessionId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setSocketState("connected");
        socket.send(JSON.stringify({ type: "ping" }));
      };

      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string);
          if (frame.metrics) setMetrics(frame.metrics as MetricsSnapshot);
          if (frame.session) {
            setStatus((prev) => ({ ...prev, state: (frame.session as CaptureSessionInfo).status, session: frame.session as CaptureSessionInfo }));
          }
          if (frame.type === "packets" && Array.isArray(frame.packets)) {
            setPackets((prev) => mergePackets(prev, frame.packets as PacketMetadata[], LIVE_PACKET_BUFFER));
          }
        } catch {
          // ignore malformed frames
        }
      };

      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setSocketState("disconnected");
        attempt += 1;
        const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 15000);
        reconnectRef.current = window.setTimeout(connect, delay);
      };

      socket.onerror = () => {
        setSocketState("error");
      };
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectRef.current) window.clearTimeout(reconnectRef.current);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [activeSessionId, status.state]);

  useEffect(() => {
    if (status.state === "running") {
      void refreshMetrics();
    }
  }, [refreshMetrics, status.state]);

  const value = useMemo<CaptureContextValue>(
    () => ({
      interfaces,
      interfacesLoading,
      interfacesError,
      loadInterfaces,
      status,
      metrics,
      packets,
      sessions,
      activeSession,
      activeSessionId,
      settings,
      settingsMeta,
      loadSettings,
      saveSettings,
      resetSettings,
      socketState,
      error,
      notice,
      clearError: () => setError(null),
      clearNotice: () => setNotice(null),
      refreshStatus,
      refreshSessions,
      startCapture,
      stopCapture,
      applyFilter,
      clearHistory,
      clearLocalPackets,
    }),
    [
      interfaces,
      interfacesLoading,
      interfacesError,
      loadInterfaces,
      status,
      metrics,
      packets,
      sessions,
      activeSession,
      activeSessionId,
      settings,
      settingsMeta,
      loadSettings,
      saveSettings,
      resetSettings,
      socketState,
      error,
      notice,
      refreshStatus,
      refreshSessions,
      startCapture,
      stopCapture,
      applyFilter,
      clearHistory,
      clearLocalPackets,
    ],
  );

  return <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>;
}

export function useCapture(): CaptureContextValue {
  const context = useContext(CaptureContext);
  if (!context) {
    throw new Error("useCapture must be used within a CaptureProvider");
  }
  return context;
}

export { API_BASE };
