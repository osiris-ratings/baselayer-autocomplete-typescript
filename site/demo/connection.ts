// What folded Connect says about the connection: a dot and a few words, from
// the session the SDK holds. Pure, for the timer that re-renders it.

import type { SessionPhase } from "@baselayer/autocomplete";

export type ConnectionState = "ok" | "pending" | "error";

export interface ConnectionStatus {
  state: ConnectionState;
  label: string;
}

/** `m:ss`, or `h:mm:ss` past the hour; never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/**
 * A pasted token is the session itself, so its expiry ends the connection.
 * A key mints the next session on the next search, so a lapsed one does not.
 */
export function connectionStatus(
  mode: "token" | "key",
  session: SessionPhase,
  now: number,
  /** Epoch ms the pasted token stops being honoured (token mode). */
  tokenExpiresAt: number | null,
): ConnectionStatus {
  if (mode === "token" && tokenExpiresAt !== null && tokenExpiresAt <= now) {
    return { state: "error", label: "expired" };
  }
  switch (session.phase) {
    case "ready": {
      const left = session.grant.expiresAt - now;
      if (left > 0) {
        return { state: "ok", label: `valid ${formatRemaining(left)}` };
      }
      return mode === "key"
        ? { state: "ok", label: "renews on the next search" }
        : { state: "error", label: "expired" };
    }
    case "minting":
      return { state: "pending", label: "minting" };
    case "backoff":
      return {
        state: "error",
        label: `retry in ${formatRemaining(session.until - now)}`,
      };
    case "unavailable":
      return { state: "error", label: "unavailable" };
    case "idle":
      return tokenExpiresAt !== null
        ? {
            state: "ok",
            label: `valid ${formatRemaining(tokenExpiresAt - now)}`,
          }
        : { state: "pending", label: "idle" };
  }
}
