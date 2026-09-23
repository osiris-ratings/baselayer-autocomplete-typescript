/**
 * Every timing and threshold the client runs under, with the console's values
 * as defaults. A host overrides any of them through
 * `createAutocompleteClient({ session, request })`.
 */
export interface SessionPolicy {
  /** Refresh once this fraction of the TTL has elapsed. */
  refreshAtFraction: number;
  /**
   * How long the grant a failed refresh was replacing keeps serving before the
   * next attempt. Without it every keystroke past `refreshAt` would mint again.
   */
  refreshRetryMs: number;
  /** The floor between two cold mint attempts when no `Retry-After` says otherwise. */
  mintRetryMs: number;
  /**
   * The longest a `Retry-After` on a failed mint is honored for. A day is the
   * longest the API asks for, and it sits well under the 2^31 ms a timer takes.
   */
  maxMintBackoffMs: number;
  /** How long a 503 with `sessionsNotConfiguredCode` stops the client minting. */
  unavailableCooldownMs: number;
  /** The API's catalog code for "sessions are not configured on this deployment". */
  sessionsNotConfiguredCode: number;
}

export interface RequestPolicy {
  /** The longest a tier `rate_limited` reply may hold a keystroke before replaying. */
  maxRetryAfterMs: number;
  /** The wait when a `rate_limited` reply carries no `Retry-After`. */
  defaultRetryAfterMs: number;
  /**
   * Consecutive calls whose re-minted grant the tier refused again before the
   * client stops minting. Two, not one: a single grant can die between the
   * mint and the replay, a second fresh one refused is the tier and the API
   * disagreeing.
   */
  authFailuresBeforeBrake: number;
  /** How long the brake holds. */
  authBrakeMs: number;
  sessionHeader: string;
  indexHeader: string;
}

export const DEFAULT_SESSION_POLICY: Readonly<SessionPolicy> = Object.freeze({
  refreshAtFraction: 0.8,
  refreshRetryMs: 5_000,
  mintRetryMs: 10_000,
  maxMintBackoffMs: 24 * 60 * 60_000,
  unavailableCooldownMs: 5 * 60_000,
  sessionsNotConfiguredCode: 481,
});

export const DEFAULT_REQUEST_POLICY: Readonly<RequestPolicy> = Object.freeze({
  maxRetryAfterMs: 2_000,
  defaultRetryAfterMs: 1_000,
  authFailuresBeforeBrake: 2,
  authBrakeMs: 60_000,
  sessionHeader: "X-Autocomplete-Session",
  indexHeader: "X-Autocomplete-Index",
});
