import { describe, expect, it } from "vitest";
import { captureStateStyle, isLiveState } from "./captureState";

describe("captureStateStyle", () => {
  it("maps known capture states to labels and tones", () => {
    expect(captureStateStyle("running")).toMatchObject({ label: "Capturing", tone: "live" });
    expect(captureStateStyle("idle")).toMatchObject({ label: "Idle", tone: "idle" });
    expect(captureStateStyle("error").tone).toBe("error");
  });

  it("falls back to idle for unknown states", () => {
    expect(captureStateStyle(undefined).label).toBe("Idle");
    expect(captureStateStyle("bogus" as never).label).toBe("Idle");
  });

  it("identifies live states", () => {
    expect(isLiveState("running")).toBe(true);
    expect(isLiveState("starting")).toBe(true);
    expect(isLiveState("stopping")).toBe(true);
    expect(isLiveState("stopped")).toBe(false);
    expect(isLiveState("idle")).toBe(false);
  });
});
