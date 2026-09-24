import type { SessionPhase } from "@baselayer/autocomplete";
import { describe, expect, it } from "vitest";

import { connectionStatus, formatRemaining } from "../../site/demo/connection";

const NOW = 1_800_000_000_000;

function ready(expiresAt: number): SessionPhase {
  return {
    phase: "ready",
    refreshing: false,
    grant: {
      sessionToken: "t",
      expiresIn: 180,
      requestBudget: 30,
      pivotAllowance: 5,
      filterMinStem: 5,
      mintedAt: NOW - 1_000,
      refreshAt: expiresAt - 36_000,
      expiresAt,
    },
  };
}

describe("formatRemaining", () => {
  it.each([
    [0, "0:00"],
    [-5_000, "0:00"],
    [400, "0:01"],
    [59_000, "0:59"],
    [177_000, "2:57"],
    [3_600_000, "1:00:00"],
    [3_725_000, "1:02:05"],
  ])("%d ms reads %s", (ms, text) => {
    expect(formatRemaining(ms)).toBe(text);
  });
});

describe("connectionStatus", () => {
  it("counts a held session down, in either mode", () => {
    for (const mode of ["token", "key"] as const) {
      expect(
        connectionStatus(mode, ready(NOW + 177_000), NOW, NOW + 177_000),
      ).toEqual({ state: "ok", label: "valid 2:57" });
    }
  });

  it("ends a pasted token's connection when the token expires", () => {
    const expired = { state: "error", label: "expired" };
    expect(connectionStatus("token", ready(NOW), NOW, NOW)).toEqual(expired);
    // Whatever the SDK last did, the token's own expiry decides.
    expect(
      connectionStatus("token", { phase: "minting", reason: "cold" }, NOW, NOW),
    ).toEqual(expired);
  });

  it("keeps a key's connection when its session lapses", () => {
    expect(connectionStatus("key", ready(NOW - 1), NOW, null)).toEqual({
      state: "ok",
      label: "renews on the next search",
    });
  });

  it("counts a pasted token down before the SDK first uses it", () => {
    expect(
      connectionStatus("token", { phase: "idle" }, NOW, NOW + 90_000),
    ).toEqual({ state: "ok", label: "valid 1:30" });
    expect(connectionStatus("key", { phase: "idle" }, NOW, null)).toEqual({
      state: "pending",
      label: "idle",
    });
  });

  it("reports minting, a backoff's wait and an unavailable tier", () => {
    expect(
      connectionStatus("key", { phase: "minting", reason: "cold" }, NOW, null),
    ).toEqual({ state: "pending", label: "minting" });
    const backoff: SessionPhase = {
      phase: "backoff",
      until: NOW + 42_000,
      scope: null,
      status: 429,
      code: 429,
    };
    expect(connectionStatus("key", backoff, NOW, null)).toEqual({
      state: "error",
      label: "retry in 0:42",
    });
    expect(
      connectionStatus("key", { phase: "unavailable", until: NOW }, NOW, null),
    ).toEqual({ state: "error", label: "unavailable" });
  });
});
