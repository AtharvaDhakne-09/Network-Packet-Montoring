import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { WS_BASE, api, ApiError } from "../services/api";
import type { SimulationConfig, SimulationState } from "../types";
import type { SocketState } from "./useCapture";

export interface UseSimulationResult {
  simId: string | null;
  state: SimulationState | null;
  socketState: SocketState;
  error: string | null;
  busy: boolean;
  attach: (simId: string | null) => void;
  start: (config: Partial<SimulationConfig>) => Promise<SimulationState | null>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  step: () => Promise<void>;
  reset: () => Promise<void>;
  stop: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
}

export function useSimulation(initialSimId: string | null = null): UseSimulationResult {
  const [simId, setSimId] = useState<string | null>(initialSimId);
  const [state, setState] = useState<SimulationState | null>(null);
  const [socketState, setSocketState] = useState<SocketState>("disconnected");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const simIdRef = useRef<string | null>(initialSimId);
  simIdRef.current = simId;

  const handleError = useCallback((err: unknown) => {
    setError(err instanceof ApiError || err instanceof Error ? err.message : String(err));
  }, []);

  const refresh = useCallback(async () => {
    try {
      const response = await api.simulationState(simIdRef.current ?? undefined);
      setState(response);
      if (!simIdRef.current) setSimId(response.sim_id);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setState(null);
        return;
      }
      handleError(err);
    }
  }, [handleError]);

  useEffect(() => {
    if (!simId) {
      setSocketState("disconnected");
      return;
    }
    let disposed = false;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      setSocketState("connecting");
      const socket = new WebSocket(`${WS_BASE}/ws/simulation/${simId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attempt = 0;
        setSocketState("connected");
        socket.send(JSON.stringify({ type: "ping" }));
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string);
          if (frame.type === "state") setState(frame as SimulationState);
        } catch {
          // ignore
        }
      };
      socket.onclose = () => {
        if (socketRef.current === socket) socketRef.current = null;
        if (disposed) return;
        setSocketState("disconnected");
        attempt += 1;
        reconnectRef.current = window.setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt, 5), 10000));
      };
      socket.onerror = () => setSocketState("error");
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
  }, [simId]);

  useEffect(() => {
    if (!simId) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [simId, refresh]);

  const start = useCallback(
    async (config: Partial<SimulationConfig>) => {
      setBusy(true);
      setError(null);
      try {
        const response = await api.simulationStart(config);
        setState(response);
        setSimId(response.sim_id);
        return response;
      } catch (err) {
        handleError(err);
        return null;
      } finally {
        setBusy(false);
      }
    },
    [handleError],
  );

  const control = useCallback(
    async (action: "pause" | "resume" | "step" | "reset" | "stop") => {
      setBusy(true);
      setError(null);
      try {
        const response = await api[
          action === "pause"
            ? "simulationPause"
            : action === "resume"
              ? "simulationResume"
              : action === "step"
                ? "simulationStep"
                : action === "reset"
                  ? "simulationReset"
                  : "simulationStop"
        ](simIdRef.current ?? undefined);
        setState(response);
      } catch (err) {
        handleError(err);
      } finally {
        setBusy(false);
      }
    },
    [handleError],
  );

  const value = useMemo<UseSimulationResult>(
    () => ({
      simId,
      state,
      socketState,
      error,
      busy,
      attach: setSimId,
      start,
      pause: () => control("pause"),
      resume: () => control("resume"),
      step: () => control("step"),
      reset: () => control("reset"),
      stop: () => control("stop"),
      refresh,
      clearError: () => setError(null),
    }),
    [simId, state, socketState, error, busy, start, control, refresh],
  );

  return value;
}
