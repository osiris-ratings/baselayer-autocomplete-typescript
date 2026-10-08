// Testing what a reader pastes before the demo uses it.
//
// An API key has no test but a mint: nothing else proves the API accepts it.
// So Apply mints once and hands that session to the client as its first, and
// the test costs nothing the first keystroke would not have.

import type {
  MintFunction,
  MintOutcome,
  MintedGrant,
} from "@baselayer-sdk/autocomplete";

import { keyMint } from "./credentials";

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
  // Only a deployment from before sandbox support answers 483.
  if (status === 422 && code === 483)
    return "This deployment does not serve sandbox sessions yet.";
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
