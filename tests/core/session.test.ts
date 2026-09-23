import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import {
  AutocompleteError,
  DEFAULT_SESSION_POLICY,
  MINT_DAY_SCOPE,
  createAutocompleteClient,
  parseMintResponse,
  type AutocompleteClient,
  type MintFunction,
  type MintOutcome,
} from "@baselayer/autocomplete";

/**
 * A port of the console's `autocompleteSession.test.ts`. The console kept one
 * grant per tab at module scope and minted through a mocked axios instance;
 * the SDK keeps one per client and mints through the injected `MintFunction`,
 * so every test builds a fresh client and queues `MintOutcome`s on a mock mint.
 */

const BASE_URL = "https://api.example.test";
const MINTED_AT = 1_700_000_000_000;
const TTL_MS = 180_000;
const {
  refreshAtFraction: REFRESH_AT_FRACTION,
  refreshRetryMs: REFRESH_RETRY_MS,
  mintRetryMs: MINT_RETRY_MS,
  maxMintBackoffMs: MAX_MINT_BACKOFF_MS,
  unavailableCooldownMs: UNAVAILABLE_COOLDOWN_MS,
  sessionsNotConfiguredCode: SESSIONS_NOT_CONFIGURED_CODE,
} = DEFAULT_SESSION_POLICY;
const TOO_MANY = { code: 429, message: "too many" };
const NOT_CONFIGURED = {
  code: SESSIONS_NOT_CONFIGURED_CODE,
  message: "not configured",
};

/** A 201 as the API sends it, read the way every mint adapter reads it. */
function grant(token: string): MintOutcome {
  return parseMintResponse(201, null, {
    session_token: token,
    expires_in: 180,
    request_budget: 150,
    pivot_allowance: 5,
    filter_min_stem: 5,
  });
}

/** A refused mint, from the status, body and axios-style headers it carried. */
function refusal(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): MintOutcome {
  return parseMintResponse(status, headers, body);
}

/**
 * What the mock mint does with nothing queued: it throws, which the client
 * reads as a network failure, much as the axios mock adapter answered 404.
 */
function unqueued(): Promise<MintOutcome> {
  return Promise.reject(new Error("no mint outcome queued"));
}

function at(epochMs: number): void {
  vi.setSystemTime(epochMs);
}

function unavailable(client: AutocompleteClient): boolean {
  return client.getSnapshot().session.phase === "unavailable";
}

interface HeldMint {
  /** Resolves once the client has called the mint. */
  started: Promise<void>;
  /** Answers the held mint. */
  answer(outcome: MintOutcome): void;
  /** The implementation to queue on the mock mint. */
  reply(): Promise<MintOutcome>;
}

/** A mint the test keeps in the air until it chooses to answer it. */
function holdMint(): HeldMint {
  let markStarted: () => void = () => undefined;
  const started = new Promise<void>(resolve => {
    markStarted = resolve;
  });
  let settle: (outcome: MintOutcome) => void = () => undefined;
  return {
    started,
    answer: outcome => settle(outcome),
    reply: () =>
      new Promise<MintOutcome>(resolve => {
        settle = resolve;
        markStarted();
      }),
  };
}

describe("getSession", () => {
  let mint: Mock<MintFunction>;
  let client: AutocompleteClient;

  beforeEach(() => {
    vi.useFakeTimers();
    at(MINTED_AT);
    mint = vi.fn<MintFunction>(unqueued);
    client = createAutocompleteClient({ baseUrl: BASE_URL, mint });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("mints once and serves the cached grant until 80% of the TTL", async () => {
    mint.mockResolvedValueOnce(grant("grant-1"));

    const first = await client.getSession();

    expect(first.sessionToken).toBe("grant-1");
    expect(first.requestBudget).toBe(150);
    expect(first.expiresAt).toBe(MINTED_AT + TTL_MS);
    expect(first.refreshAt).toBe(MINTED_AT + TTL_MS * REFRESH_AT_FRACTION);

    // One millisecond short of the refresh point: still the same grant.
    at(MINTED_AT + TTL_MS * REFRESH_AT_FRACTION - 1);
    expect(await client.getSession()).toBe(first);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("re-mints once 80% of the TTL has elapsed", async () => {
    mint
      .mockResolvedValueOnce(grant("grant-1"))
      .mockResolvedValueOnce(grant("grant-2"));

    await client.getSession();
    at(MINTED_AT + TTL_MS * REFRESH_AT_FRACTION);

    const refreshed = await client.getSession();

    expect(refreshed.sessionToken).toBe("grant-2");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("single-flights concurrent mints so a burst pays for one Order", async () => {
    mint.mockResolvedValueOnce(grant("grant-1"));

    const grants = await Promise.all([
      client.getSession(),
      client.getSession(),
      client.getSession(),
    ]);

    expect(grants.map(g => g.sessionToken)).toEqual([
      "grant-1",
      "grant-1",
      "grant-1",
    ]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("force discards the cached grant", async () => {
    mint
      .mockResolvedValueOnce(grant("grant-1"))
      .mockResolvedValueOnce(grant("grant-2"));

    await client.getSession();
    const forced = await client.getSession({ force: true });

    expect(forced.sessionToken).toBe("grant-2");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  describe("a refresh that fails while the grant it replaces is still good", () => {
    it("serves the old grant instead of taking the typeahead down", async () => {
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockResolvedValueOnce(refusal(429, TOO_MANY));

      const first = await client.getSession();
      // Past the refresh point, well short of the expiry: the tier still
      // honors grant-1 for another 20% of its TTL.
      const refreshPoint = MINTED_AT + TTL_MS * REFRESH_AT_FRACTION;
      at(refreshPoint);

      const served = await client.getSession();

      expect(served.sessionToken).toBe("grant-1");
      expect(served.expiresAt).toBe(first.expiresAt);
      expect(mint).toHaveBeenCalledTimes(2);
    });

    it("holds the next attempt off instead of minting once per keystroke", async () => {
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockResolvedValue(refusal(429, TOO_MANY));

      await client.getSession();
      const refreshPoint = MINTED_AT + TTL_MS * REFRESH_AT_FRACTION;
      at(refreshPoint);
      await client.getSession();

      // Three more keystrokes inside the retry window mint nothing.
      at(refreshPoint + REFRESH_RETRY_MS - 1);
      for (let i = 0; i < 3; i += 1) {
        expect((await client.getSession()).sessionToken).toBe("grant-1");
      }
      expect(mint).toHaveBeenCalledTimes(2);

      // Past the window it tries again.
      at(refreshPoint + REFRESH_RETRY_MS);
      expect((await client.getSession()).sessionToken).toBe("grant-1");
      expect(mint).toHaveBeenCalledTimes(3);
    });

    it("gives up once the old grant has expired", async () => {
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockResolvedValue(refusal(429, TOO_MANY));

      await client.getSession();
      at(MINTED_AT + TTL_MS);

      await expect(client.getSession()).rejects.toMatchObject({
        kind: "mint_backoff",
      });
    });

    it("does not fall back when the deployment cannot mint at all", async () => {
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockResolvedValueOnce(refusal(503, NOT_CONFIGURED));

      await client.getSession();
      at(MINTED_AT + TTL_MS * REFRESH_AT_FRACTION);

      // The cooldown is the answer here, not a grant with minutes left: the
      // field steps aside for the plain input.
      await expect(client.getSession()).rejects.toMatchObject({
        kind: "session_unavailable",
      });
      expect(unavailable(client)).toBe(true);
    });

    it("does not fall back to a grant the tier just refused", async () => {
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockResolvedValueOnce(refusal(429, TOO_MANY));

      await client.getSession();

      // `force` is the caller saying the tier refused this grant, so serving it
      // again would only fail again.
      await expect(client.getSession({ force: true })).rejects.toBeDefined();
    });

    it("a force arriving mid-refresh withdraws the fallback that refresh holds", async () => {
      // The refused grant survives in one more place than `cached`: the mint
      // already in the air is holding it as what it falls back on. A refresh
      // starts at 80% of the TTL, so the tier's 401 lands while that refresh is
      // still running, the forced caller single-flights onto it, and its
      // failure path used to hand the refused grant straight back, re-cached,
      // so every keystroke after it got the spent session too.
      const refresh = holdMint();
      mint
        .mockResolvedValueOnce(grant("grant-1"))
        .mockImplementationOnce(refresh.reply);

      expect((await client.getSession()).sessionToken).toBe("grant-1");

      // Past 80% of the TTL: this one refreshes rather than serving the cache,
      // and is left in the air.
      at(MINTED_AT + TTL_MS * REFRESH_AT_FRACTION + 1);
      const refreshing = client.getSession();
      await refresh.started;

      const forced = client.getSession({ force: true });
      refresh.answer(refusal(429, TOO_MANY));

      await expect(forced).rejects.toBeDefined();
      await expect(refreshing).rejects.toBeDefined();
      // And it is not in the cache either: a further keystroke hits the cold
      // backoff, which only fires when there is no grant to serve.
      await expect(client.getSession()).rejects.toMatchObject({
        kind: "mint_backoff",
      });
    });
  });

  it("a mint disowned by a reset that then fails does not block the next generation", async () => {
    // Only the success path was generation-guarded. A prewarm in the air when
    // the user signed out, refused after the reset, still wrote the cold
    // backoff, so the next sign-in's first mint was refused locally with no
    // request made, for as long as the refused generation's Retry-After said.
    const held = holdMint();
    mint
      .mockImplementationOnce(held.reply)
      .mockResolvedValueOnce(grant("grant-2"));

    const disowned = client.getSession();
    await held.started;
    client.reset();
    held.answer(refusal(429, TOO_MANY, { "retry-after": "600" }));
    await expect(disowned).rejects.toBeDefined();

    // The next generation's cold mint reaches the API.
    expect((await client.getSession()).sessionToken).toBe("grant-2");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("a disowned mint that finds the deployment unable to mint does not mark it unavailable for the next generation", async () => {
    // The 503/481 cooldown was written inside `mint()`, which does not know
    // it was disowned. A prewarm in the air at sign-out that then met a 481
    // told the next sign-in the deployment cannot mint, for five minutes,
    // with no request made.
    const held = holdMint();
    mint
      .mockImplementationOnce(held.reply)
      .mockResolvedValueOnce(grant("grant-2"));

    const disowned = client.getSession();
    await held.started;
    client.reset();
    held.answer(refusal(503, NOT_CONFIGURED));
    await expect(disowned).rejects.toMatchObject({
      kind: "session_unavailable",
    });

    expect(unavailable(client)).toBe(false);
    expect((await client.getSession()).sessionToken).toBe("grant-2");
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it("caps the backoff a Retry-After can impose", async () => {
    // An absurd Retry-After used to become an absurd setTimeout in the hook's
    // cooldown timer, which overflows past 2^31 ms into an immediate re-arm
    // loop. The tier path caps its Retry-After the same way.
    mint.mockResolvedValueOnce(
      refusal(429, TOO_MANY, { "retry-after": "99999999999" }),
    );
    await expect(client.getSession()).rejects.toBeDefined();

    const refused = await client.getSession().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(AutocompleteError);
    expect(refused).toMatchObject({ kind: "mint_backoff" });
    expect((refused as AutocompleteError).until).toBeLessThanOrEqual(
      MINTED_AT + MAX_MINT_BACKOFF_MS,
    );
  });

  it("a spent day holds off for its whole Retry-After and says which pool refused", async () => {
    // The day's Retry-After is the moment the oldest mint of the day ages out,
    // hours away. Capped at the ten-minute window, a keystroke walked back
    // into the same 429 every ten minutes all day; and the first refusal is
    // the same error as the ones the cooldown answers locally, so the footer
    // can say the same thing on every keystroke.
    const retryAfterSeconds = 12 * 60 * 60;
    mint.mockResolvedValue(
      refusal(
        429,
        {
          code: 429,
          message: "too many",
          metadata: {
            scope: MINT_DAY_SCOPE,
            limit: 50,
            window_seconds: 86_400,
          },
        },
        { "retry-after": String(retryAfterSeconds) },
      ),
    );

    // The console's `dayLimit: true` is the SDK's `scope: "day"`.
    const refused = await client.getSession().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(AutocompleteError);
    expect(refused).toMatchObject({
      kind: "mint_backoff",
      scope: "day",
      until: MINTED_AT + retryAfterSeconds * 1000,
    });

    // Eleven hours on, a keystroke hears the same answer without a request.
    at(MINTED_AT + 11 * 60 * 60_000);
    const later = await client.getSession().catch((error: unknown) => error);
    expect(later).toBeInstanceOf(AutocompleteError);
    expect(later).toMatchObject({ kind: "mint_backoff", scope: "day" });
    expect(mint).toHaveBeenCalledTimes(1);

    // A sign-out forgets it, as it forgets the rest of the cooldown.
    client.reset();
    mint.mockReset();
    mint.mockResolvedValueOnce(grant("next-day"));
    expect((await client.getSession()).sessionToken).toBe("next-day");
  });

  it("a spent window is a wait, not the day", async () => {
    mint.mockResolvedValue(
      refusal(
        429,
        {
          code: 429,
          message: "too many",
          metadata: {
            scope: "autocomplete_session_mint:organization",
            limit: 20,
            window_seconds: 600,
          },
        },
        { "retry-after": "595" },
      ),
    );

    // The console's `dayLimit: false` is the SDK's `scope: "window"`.
    const refused = await client.getSession().catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(AutocompleteError);
    expect(refused).toMatchObject({
      kind: "mint_backoff",
      scope: "window",
      until: MINTED_AT + 595_000,
    });
  });

  it("clears the in-flight slot after a failed mint so the next call retries", async () => {
    mint
      .mockResolvedValueOnce(refusal(500, { code: 500, message: "boom" }))
      .mockResolvedValueOnce(grant("grant-1"));

    // The console rethrew the raw axios error here; the SDK names the refusal.
    await expect(client.getSession()).rejects.toMatchObject({
      kind: "mint_refused",
      status: 500,
    });
    // The slot is clear, but a cold failure now holds the next attempt off, so
    // step past the backoff to show the retry actually happens.
    at(MINTED_AT + MINT_RETRY_MS + 1);
    const recovered = await client.getSession();

    expect(recovered.sessionToken).toBe("grant-1");
  });

  describe("sessions not configured on this deployment (503 code 481)", () => {
    it("stops minting for the cooldown, then tries again", async () => {
      mint
        .mockResolvedValueOnce(refusal(503, NOT_CONFIGURED))
        .mockResolvedValueOnce(grant("grant-1"));

      await expect(client.getSession()).rejects.toMatchObject({
        kind: "session_unavailable",
      });
      expect(unavailable(client)).toBe(true);

      // Inside the cooldown the API is not asked again.
      await expect(client.getSession()).rejects.toMatchObject({
        kind: "session_unavailable",
      });
      expect(mint).toHaveBeenCalledTimes(1);

      at(MINTED_AT + UNAVAILABLE_COOLDOWN_MS);
      expect(unavailable(client)).toBe(false);
      expect((await client.getSession()).sessionToken).toBe("grant-1");
      expect(mint).toHaveBeenCalledTimes(2);
    });

    it("is the only 503 that means unavailable", async () => {
      mint.mockResolvedValueOnce(refusal(503, { code: 503, message: "busy" }));

      const failure = client.getSession();

      await expect(failure).rejects.toBeDefined();
      await expect(failure).rejects.not.toMatchObject({
        kind: "session_unavailable",
      });
      expect(unavailable(client)).toBe(false);
    });

    it("is forgotten by a reset", async () => {
      mint.mockResolvedValueOnce(refusal(503, NOT_CONFIGURED));
      await expect(client.getSession()).rejects.toBeDefined();
      expect(unavailable(client)).toBe(true);

      client.reset();

      expect(unavailable(client)).toBe(false);
    });
  });

  it("a reset disowns a mint already in flight, so a logout is not undone by a prewarm", async () => {
    // Cross-tab logout never navigates: a prewarm that started before the
    // sign-out resolves after it and used to write the grant back for the
    // rest of its TTL.
    const held = holdMint();
    mint.mockImplementation(held.reply);
    const late = client.getSession();
    await held.started;
    client.reset();
    held.answer(grant("late-grant"));
    expect((await late).sessionToken).toBe("late-grant");

    mint.mockReset();
    mint.mockResolvedValueOnce(grant("fresh-grant"));
    const next = await client.getSession();
    expect(next.sessionToken).toBe("fresh-grant");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("a cold mint that fails holds the next attempt off instead of retrying per keystroke", async () => {
    // The gap this closes: only the REFRESH path had a backoff. A cold mint had
    // no grant to fall back on, so it rethrew leaving no trace and the next
    // keystroke minted again: one mint per keystroke into a route that had
    // just refused the caller.
    mint.mockResolvedValue(refusal(429, {}));

    await expect(client.getSession()).rejects.toBeDefined();
    expect(mint).toHaveBeenCalledTimes(1);

    // The next few keystrokes ask again and must not reach the network.
    for (let i = 0; i < 3; i += 1) {
      await expect(client.getSession()).rejects.toMatchObject({
        kind: "mint_backoff",
      });
    }
    expect(mint).toHaveBeenCalledTimes(1);

    // Once the backoff has passed, it tries again.
    at(MINTED_AT + MINT_RETRY_MS + 1);
    mint.mockReset();
    mint.mockResolvedValueOnce(grant("after-backoff"));
    expect((await client.getSession()).sessionToken).toBe("after-backoff");
  });

  it("honors Retry-After on a refused mint rather than its own floor", async () => {
    const retryAfterSeconds = 600;
    mint.mockResolvedValue(
      refusal(429, {}, { "retry-after": String(retryAfterSeconds) }),
    );

    await expect(client.getSession()).rejects.toBeDefined();

    // Well past the local floor, still inside what the API asked for.
    at(MINTED_AT + MINT_RETRY_MS + 1);
    await expect(client.getSession()).rejects.toMatchObject({
      kind: "mint_backoff",
    });
    expect(mint).toHaveBeenCalledTimes(1);

    at(MINTED_AT + retryAfterSeconds * 1000 + 1);
    mint.mockReset();
    mint.mockResolvedValueOnce(grant("after-retry-after"));
    expect((await client.getSession()).sessionToken).toBe("after-retry-after");
  });

  it("rejects a grant that is not the shape the API advertises", async () => {
    mint.mockResolvedValueOnce(
      refusal(201, { session_token: "", expires_in: 180 }),
    );

    await expect(client.getSession()).rejects.toBeDefined();
  });

  it("prewarm swallows a failed mint", async () => {
    mint.mockResolvedValueOnce(refusal(503, {}));

    expect(() => client.prewarm()).not.toThrow();
    // Let the rejected promise settle inside the swallow.
    await vi.advanceTimersByTimeAsync(0);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("two clients on one page share neither a grant nor a cooldown", async () => {
    // The console held one grant and one cooldown per tab at module scope.
    const otherMint = vi.fn<MintFunction>(unqueued);
    const other = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint: otherMint,
    });
    mint
      .mockResolvedValueOnce(grant("grant-1"))
      .mockResolvedValueOnce(grant("grant-2"));
    otherMint.mockResolvedValue(
      refusal(429, TOO_MANY, { "retry-after": "600" }),
    );

    const first = await client.getSession();

    // The other client asks its own mint rather than serving this one's grant,
    // and its refusal cools only itself down.
    await expect(other.getSession()).rejects.toMatchObject({
      kind: "mint_backoff",
    });
    expect(otherMint).toHaveBeenCalledTimes(1);
    expect(other.getSnapshot().session).toMatchObject({
      phase: "backoff",
      until: MINTED_AT + 600_000,
    });
    expect(client.getSnapshot().session).toMatchObject({
      phase: "ready",
      grant: first,
    });

    // This client still mints while the other waits.
    expect((await client.getSession({ force: true })).sessionToken).toBe(
      "grant-2",
    );
    expect(mint).toHaveBeenCalledTimes(2);

    // And a sign-out of one leaves the other exactly as it was.
    client.reset();
    expect(client.getSnapshot().session.phase).toBe("idle");
    expect(other.getSnapshot().session.phase).toBe("backoff");
    await expect(other.getSession()).rejects.toMatchObject({
      kind: "mint_backoff",
    });
    expect(otherMint).toHaveBeenCalledTimes(1);
  });
});

describe("DEFAULT_SESSION_POLICY", () => {
  it("keeps the console's timings", () => {
    expect(DEFAULT_SESSION_POLICY).toEqual({
      refreshAtFraction: 0.8,
      refreshRetryMs: 5_000,
      mintRetryMs: 10_000,
      maxMintBackoffMs: 24 * 60 * 60_000,
      unavailableCooldownMs: 5 * 60_000,
      sessionsNotConfiguredCode: 481,
    });
  });
});
