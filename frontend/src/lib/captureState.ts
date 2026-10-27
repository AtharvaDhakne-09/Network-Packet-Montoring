import type { CaptureState } from "../types";

export interface StateStyle {
  label: string;
  tone: "idle" | "live" | "warn" | "error" | "muted";
  description: string;
}

export const CAPTURE_STATES: Record<CaptureState, StateStyle> = {
  idle: { label: "Idle", tone: "idle", description: "No capture session is running." },
  starting: { label: "Starting", tone: "warn", description: "Opening the capture interface." },
  running: { label: "Capturing", tone: "live", description: "Live packets are being captured." },
  stopping: { label: "Stopping", tone: "warn", description: "Closing the capture session." },
  stopped: { label: "Stopped", tone: "muted", description: "The last capture session has stopped." },
  error: { label: "Error", tone: "error", description: "The capture session failed." },
};

export function captureStateStyle(state: CaptureState | undefined): StateStyle {
  if (!state) return CAPTURE_STATES.idle;
  return CAPTURE_STATES[state] ?? CAPTURE_STATES.idle;
}

export function isLiveState(state: CaptureState | undefined): boolean {
  return state === "running" || state === "starting" || state === "stopping";
}
