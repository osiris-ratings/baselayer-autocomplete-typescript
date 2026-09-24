// Testing what a reader pastes before the demo uses it.
//
// An API key has no test but a mint: nothing else proves the API accepts it.
// So Apply mints once and hands that session to the client as its first, and
// the test costs nothing the first keystroke would not have. A session token
// is tested against the tier's `GET /autocomplete/version`, which checks the
// session (signature, expiry, the Origin it is bound to) and keeps its own
// per-route budget, so none of the token's typing budget goes on it.

import {
  parseErrorEnvelope,
  type MintFunction,
  type MintOutcome,
  type MintedGrant,
} from "@baselayer-sdk/autocomplete";

import { keyMint, readClaims } from "./credentials";

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

export type CheckResult =
  | {
      ok: true;
      message: string;
      grant?: { grant: MintedGrant; mintedAt: number };
    }
  | { ok: false; message: string };

type Refused = Extract<MintOutcome, { kind: "refused" }>;

/** A mint's refusal, in words someone can act on. */
function describeRefusal(refused: Refused): string {
  const { status, code } = refused;
  if (status === 0)
    return refused.message ?? "The API did not answer this page.";
  if (status === 401) return "The API does not recognize this key.";
  if (status === 402) return "The organization is locked. Contact Baselayer.";
  if (status === 403 && code === 30)
    return "The key lacks the autocomplete.read permission.";
  if (status === 403 && code === 37)
    return "Autocomplete is not enabled for this organization.";
  if (status === 422 && code === 483)
    return "The key belongs to a sandbox application; use a production application's key.";
  if (status === 429) {
    const wait = refused.retryAfterSeconds;
    return `The organization's session pool is spent${wait !== null ? `; it admits another in ${wait} s` : ""}.`;
  }
  if (status === 503) return "The deployment cannot mint sessions right now.";
  return `HTTP ${status}${code !== null ? `, code ${code}` : ""}${refused.message !== null ? `: ${refused.message}` : ""}`;
}

export async function testKey(
  baseUrl: string,
  apiKey: string,
  fetchImpl: FetchImpl,
): Promise<CheckResult> {
  let outcome: MintOutcome;
  try {
    outcome = await keyMint(
      baseUrl,
      apiKey,
      fetchImpl,
    )({
      reason: "cold",
      signal: new AbortController().signal,
    });
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
  if (outcome.kind === "refused") {
    return { ok: false, message: describeRefusal(outcome) };
  }
  const { grant } = outcome;
  return {
    ok: true,
    message: "Key accepted: it minted a session, which the demo now uses.",
    grant: { grant, mintedAt: Date.now() },
  };
}

/** A mint that answers with the session the test minted, then mints as usual. */
export function withFirstGrant(
  first: { grant: MintedGrant; mintedAt: number } | undefined,
  mint: MintFunction,
): MintFunction {
  let pending = first;
  return async context => {
    if (pending !== undefined) {
      const { grant, mintedAt } = pending;
      pending = undefined;
      const remaining =
        grant.expiresIn - Math.floor((Date.now() - mintedAt) / 1000);
      // A session with seconds left is not worth handing over.
      if (remaining > 10) {
        return { kind: "granted", grant: { ...grant, expiresIn: remaining } };
      }
    }
    return mint(context);
  };
}

export async function testToken(
  baseUrl: string,
  token: string,
  fetchImpl: FetchImpl,
): Promise<CheckResult> {
  const claims = readClaims(token);
  if (claims === null) {
    return { ok: false, message: "That is not a session token." };
  }
  if (claims.exp * 1000 <= Date.now()) {
    return {
      ok: false,
      message: "This session token has expired; mint a new one.",
    };
  }
  let response: Response;
  try {
    response = await fetchImpl(`${baseUrl}/autocomplete/version`, {
      headers: {
        Accept: "application/json",
        "X-Autocomplete-Session": token.trim(),
      },
      credentials: "omit",
    });
  } catch {
    return {
      ok: false,
      message:
        "The tier did not answer this page (most likely CORS: it does not admit this origin).",
    };
  }
  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (response.ok) {
    return { ok: true, message: "The tier accepts this token." };
  }
  const envelope = parseErrorEnvelope(body);
  const detail = envelope?.metadata?.["detail"];
  if (detail === "origin_mismatch") {
    return {
      ok: false,
      message: `The token is bound to ${claims.ori ?? "another origin"}, not this page (${window.location.origin}). Mint one with this page's Origin.`,
    };
  }
  return {
    ok: false,
    message:
      envelope?.message ?? `The tier refused it: HTTP ${response.status}.`,
  };
}
