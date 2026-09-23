import { AutocompleteError, type MintScope } from "./errors";
import type {
  MintFunction,
  MintOutcome,
  MintReason,
  MintedGrant,
} from "./mint";
import type { SessionPolicy } from "./policy";

/**
 * A grant as the client holds it: what the mint said, plus when to refresh it
 * and when the tier stops honoring it.
 */
export interface Grant extends MintedGrant {
  /** Epoch ms of the mint. */
  mintedAt: number;
  /** Epoch ms after which the grant is refreshed before use. */
  refreshAt: number;
  /**
   * Epoch ms at which the tier stops honoring the grant, by the local clock:
   * the mint plus `expiresIn`, whatever `expiresAtUtc` says.
   */
  expiresAt: number;
}

export type SessionPhase =
  | { phase: "idle" }
  | { phase: "minting"; reason: MintReason }
  | { phase: "ready"; grant: Grant; refreshing: boolean }
  | {
      phase: "backoff";
      until: number;
      scope: MintScope | null;
      status: number;
      code: number | null;
    }
  | { phase: "unavailable"; until: number };

export interface MintEvent {
  reason: MintReason;
  outcome: MintOutcome;
  durationMs: number;
  /** The grant it produced, or null when refused. */
  grant: Grant | null;
  generation: number;
}

export interface SessionHooks {
  now(): number;
  onMint(event: MintEvent): void;
  onChange(): void;
  onGrant(grant: Grant | null): void;
}

interface Blocked {
  until: number;
  scope: MintScope | null;
  status: number;
  code: number | null;
}

/**
 * The grant cache, one per client. A port of the console's session module
 * with its module-scope state made instance state, so two clients on one page
 * never share a grant, a cooldown or a backoff.
 *
 * The grant is refreshed lazily once past `refreshAtFraction` of its TTL, so a
 * typing session never sees an expiry mid-word, and the mint is single-flighted
 * so a burst of keystrokes on a cold tab pays for exactly one mint.
 */
export class SessionManager {
  private cached: Grant | null = null;
  private inFlight: Promise<Grant> | null = null;
  private inFlightReason: MintReason = "cold";
  /**
   * The grant an in-flight mint falls back on if it fails: the one it is
   * replacing, for as long as the tier still honors it. A field rather than
   * a closure capture so that `force` can WITHDRAW it: a refresh starts at 80 %
   * of the TTL, the tier can refuse that same grant while the refresh is in
   * the air, and a forced caller that joins the running mint must not be
   * handed the refused grant back when that mint fails.
   */
  private fallback: Grant | null = null;
  private unavailableUntil = 0;
  /** A cold mint failed and asked to be left alone until `until`. */
  private blocked: Blocked | null = null;
  /**
   * Bumped by every reset. A mint in flight when the reset happened resolves
   * afterwards and must not write back: a prewarm started before a sign-out
   * would otherwise put a live credential back in memory.
   */
  private generationValue = 0;
  private controller = new AbortController();
  private cooldownTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly mint: MintFunction,
    private readonly policy: SessionPolicy,
    private readonly hooks: SessionHooks,
    restored: Grant | null = null,
  ) {
    if (restored !== null && hooks.now() < restored.expiresAt) {
      this.cached = restored;
    }
  }

  get generation(): number {
    return this.generationValue;
  }

  /** Epoch ms until which the API has said it cannot mint; 0 otherwise. */
  unavailableUntilMs(): number {
    return this.hooks.now() < this.unavailableUntil ? this.unavailableUntil : 0;
  }

  phase(): SessionPhase {
    const now = this.hooks.now();
    if (now < this.unavailableUntil) {
      return { phase: "unavailable", until: this.unavailableUntil };
    }
    if (this.cached !== null && now < this.cached.expiresAt) {
      return {
        phase: "ready",
        grant: this.cached,
        refreshing: this.inFlight !== null,
      };
    }
    if (this.inFlight !== null) {
      return { phase: "minting", reason: this.inFlightReason };
    }
    if (this.blocked !== null && now < this.blocked.until) {
      return { phase: "backoff", ...this.blocked };
    }
    return { phase: "idle" };
  }

  /**
   * The current grant, minting or refreshing when needed.
   *
   * `force` discards the cached grant first (the tier just refused it), and
   * withdraws it as the fallback of a mint already in flight, the only other
   * place it survives. While the API has said it cannot mint (503 with the
   * sessions-not-configured code) this rejects at once, without a request,
   * until the cooldown has passed.
   */
  getSession({
    force = false,
    prewarm = false,
  }: { force?: boolean; prewarm?: boolean } = {}): Promise<Grant> {
    const now = this.hooks.now();
    if (now < this.unavailableUntil) {
      return Promise.reject(this.unavailableError(this.unavailableUntil));
    }
    // A cold mint failed recently and asked to be left alone. Reject without a
    // request rather than sending one per keystroke into whatever refused it.
    if (
      this.cached === null &&
      this.blocked !== null &&
      now < this.blocked.until
    ) {
      return Promise.reject(this.backoffError(this.blocked));
    }
    if (force) {
      this.cached = null;
      this.fallback = null;
      this.hooks.onGrant(null);
    }
    if (this.cached !== null && now < this.cached.refreshAt) {
      return Promise.resolve(this.cached);
    }
    return (
      this.inFlight ??
      this.startMint(
        force
          ? "forced"
          : prewarm
            ? "prewarm"
            : this.cached
              ? "refresh"
              : "cold",
      )
    );
  }

  /**
   * Drop the cached grant and forget every cooldown: a sign-out. A mint still
   * in flight is disowned and aborted; whoever awaited it gets its answer, but
   * nothing it resolves to is kept.
   */
  reset(): void {
    this.generationValue += 1;
    this.controller.abort();
    this.controller = new AbortController();
    this.cached = null;
    this.inFlight = null;
    this.fallback = null;
    this.unavailableUntil = 0;
    this.blocked = null;
    this.clearCooldownTimer();
    this.hooks.onGrant(null);
    this.hooks.onChange();
  }

  private startMint(reason: MintReason): Promise<Grant> {
    const startedIn = this.generationValue;
    const startedAt = this.hooks.now();
    const signal = this.controller.signal;
    this.fallback = this.cached;
    this.inFlightReason = reason;
    const request: Promise<Grant> = this.callMint(reason, signal).then(
      outcome => {
        const durationMs = this.hooks.now() - startedAt;
        if (outcome.kind === "granted") {
          const grant = this.grantFrom(outcome.grant, startedAt);
          this.hooks.onMint({
            reason,
            outcome,
            durationMs,
            grant,
            generation: startedIn,
          });
          if (this.generationValue === startedIn) {
            this.cached = grant;
            this.blocked = null;
            this.hooks.onGrant(grant);
          }
          return grant;
        }
        this.hooks.onMint({
          reason,
          outcome,
          durationMs,
          grant: null,
          generation: startedIn,
        });
        return this.onRefused(outcome, startedIn);
      },
    );
    const settled = request.finally(() => {
      if (this.inFlight === settled) {
        this.inFlight = null;
        this.fallback = null;
        this.hooks.onChange();
      }
    });
    this.inFlight = settled;
    this.hooks.onChange();
    return settled;
  }

  /** A mint that throws (the network) is a refusal with status 0. */
  private async callMint(
    reason: MintReason,
    signal: AbortSignal,
  ): Promise<MintOutcome> {
    try {
      return await this.mint({ reason, signal });
    } catch (error) {
      return {
        kind: "refused",
        status: 0,
        code: null,
        retryAfterSeconds: null,
        scope: null,
        message: error instanceof Error ? error.message : null,
      };
    }
  }

  private grantFrom(minted: MintedGrant, mintedAt: number): Grant {
    const ttlMs = minted.expiresIn * 1000;
    return {
      ...minted,
      mintedAt,
      refreshAt: mintedAt + ttlMs * this.policy.refreshAtFraction,
      expiresAt: mintedAt + ttlMs,
    };
  }

  private onRefused(
    outcome: Extract<MintOutcome, { kind: "refused" }>,
    startedIn: number,
  ): Grant {
    const now = this.hooks.now();
    const notConfigured =
      outcome.status === 503 &&
      outcome.code === this.policy.sessionsNotConfiguredCode;
    // Disowned by a reset while in the air: hand the failure to whoever
    // awaited it and touch nothing, so a prewarm refused after a sign-out
    // does not arm a cooldown for the next sign-in.
    if (this.generationValue !== startedIn) {
      throw notConfigured
        ? this.unavailableError(now + this.policy.unavailableCooldownMs)
        : this.refusedError(outcome, now);
    }
    // The deployment cannot mint at all: not transient, so it keeps its own
    // cooldown and never falls back to the old grant.
    if (notConfigured) {
      this.unavailableUntil = now + this.policy.unavailableCooldownMs;
      this.armCooldownTimer(this.unavailableUntil);
      throw this.unavailableError(this.unavailableUntil);
    }
    // A refresh starts at 80 % of the TTL, so a mint can fail while the grant
    // it was replacing is still one the tier honors, and the caller who walks
    // into the mint limiter is exactly the one who has been typing. Serve it,
    // and hold the next attempt off so the rest of its life is not one mint
    // per keystroke.
    const refreshing = this.fallback;
    if (refreshing !== null && now < refreshing.expiresAt) {
      this.cached = {
        ...refreshing,
        refreshAt: Math.min(
          now + this.policy.refreshRetryMs,
          refreshing.expiresAt,
        ),
      };
      this.hooks.onGrant(this.cached);
      return this.cached;
    }
    // Nothing to fall back on, so this rejects, but not for free: without a
    // cooldown the next keystroke mints again against whatever just refused.
    const backoffMs =
      outcome.retryAfterSeconds !== null
        ? Math.min(
            outcome.retryAfterSeconds * 1000,
            this.policy.maxMintBackoffMs,
          )
        : this.policy.mintRetryMs;
    this.blocked = {
      until: now + backoffMs,
      scope: outcome.scope,
      status: outcome.status,
      code: outcome.code,
    };
    this.armCooldownTimer(this.blocked.until);
    // A 429 is the API asking for a wait, and the keystroke that walked into
    // it hears the same answer as the next one. Anything else is reported as
    // the failure it is, once; the keystrokes inside the floor hear the wait.
    if (outcome.status === 429) {
      throw this.backoffError(this.blocked);
    }
    throw this.refusedError(outcome, now);
  }

  private unavailableError(until: number): AutocompleteError {
    return new AutocompleteError({
      kind: "session_unavailable",
      message: "Autocomplete sessions are not configured on this deployment",
      status: 503,
      code: this.policy.sessionsNotConfiguredCode,
      until,
    });
  }

  private backoffError(blocked: Blocked): AutocompleteError {
    return new AutocompleteError({
      kind: "mint_backoff",
      message: "Waiting before asking for another autocomplete session",
      status: blocked.status,
      code: blocked.code,
      until: blocked.until,
      scope: blocked.scope,
      retryAfterMs: Math.max(0, blocked.until - this.hooks.now()),
    });
  }

  private refusedError(
    outcome: Extract<MintOutcome, { kind: "refused" }>,
    now: number,
  ): AutocompleteError {
    return new AutocompleteError({
      kind: "mint_refused",
      message:
        outcome.message ??
        (outcome.status === 0
          ? "The autocomplete session could not be minted"
          : `The autocomplete session mint failed (HTTP ${outcome.status})`),
      status: outcome.status,
      code: outcome.code,
      until: this.blocked?.until ?? null,
      scope: outcome.scope,
      // An answer's own message is written for a person; a thrown mint's
      // (status 0) is a JavaScript error's text, and stays in `message`.
      userMessage: outcome.status > 0 ? outcome.message : null,
      retryAfterMs:
        this.blocked !== null ? Math.max(0, this.blocked.until - now) : null,
    });
  }

  /** Tell subscribers when a cooldown ends, so a snapshot never goes stale. */
  private armCooldownTimer(until: number): void {
    this.clearCooldownTimer();
    const delay = Math.max(0, until - this.hooks.now()) + 1;
    const timer = setTimeout(() => {
      this.cooldownTimer = null;
      this.hooks.onChange();
    }, delay);
    (timer as { unref?: () => void }).unref?.();
    this.cooldownTimer = timer;
    this.hooks.onChange();
  }

  private clearCooldownTimer(): void {
    if (this.cooldownTimer !== null) {
      clearTimeout(this.cooldownTimer);
      this.cooldownTimer = null;
    }
  }
}
