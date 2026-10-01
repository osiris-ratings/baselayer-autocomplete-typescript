import type { SessionPhase } from "@baselayer-sdk/autocomplete";
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
  it("counts a held session down", () => {
    expect(connectionStatus(ready(NOW + 177_000), NOW)).toEqual({
      state: "ok",
      label: "valid 2:57",
    });
  });

  it("keeps the connection when the session lapses", () => {
    expect(connectionStatus(ready(NOW - 1), NOW)).toEqual({
      state: "ok",
      label: "renews on the next search",
    });
  });

  it("reads idle before the SDK first mints", () => {
    expect(connectionStatus({ phase: "idle" }, NOW)).toEqual({
      state: "pending",
      label: "idle",
    });
  });

  it("reports minting, a backoff's wait and an unavailable tier", () => {
    expect(connectionStatus({ phase: "minting", reason: "cold" }, NOW)).toEqual(
      { state: "pending", label: "minting" },
    );
    const backoff: SessionPhase = {
      phase: "backoff",
      until: NOW + 42_000,
      scope: null,
      status: 429,
      code: 429,
    };
    expect(connectionStatus(backoff, NOW)).toEqual({
      state: "error",
      label: "retry in 0:42",
    });
    expect(connectionStatus({ phase: "unavailable", until: NOW }, NOW)).toEqual(
      { state: "error", label: "unavailable" },
    );
  });
});
