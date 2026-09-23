import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AutocompleteError,
  type AutocompleteClient,
  type BusinessSuggestion,
  type ClientSnapshot,
  type Filters,
  type SessionPhase,
  type SuggestResult,
} from "@baselayer/autocomplete";

import {
  AutocompleteClientProvider,
  DEBOUNCE_MS,
  DEFAULT_MESSAGES,
  EMPTY_AUTOCOMPLETE_STATE,
  useBusinessAutocomplete,
} from "../../src/react";

function snapshotWith(session: SessionPhase): ClientSnapshot {
  return {
    session,
    brake: null,
    usage: {
      requestsSinceMint: 0,
      requestBudget: null,
      pivotAllowance: null,
      pivotsExceededEvents: 0,
    },
    lastIndexTag: null,
    generation: 0,
  };
}

const IDLE = snapshotWith({ phase: "idle" });

/**
 * The console mocked two module functions; the SDK hook asks a client, so the
 * fake is a client whose `suggest` and `getSnapshot` stand in for them.
 */
function fakeClient() {
  return {
    baseUrl: "https://api.example.test",
    suggest: vi.fn<AutocompleteClient["suggest"]>(),
    getSnapshot: vi.fn<AutocompleteClient["getSnapshot"]>(() => IDLE),
    getSession: vi.fn<AutocompleteClient["getSession"]>(),
    prewarm: vi.fn<AutocompleteClient["prewarm"]>(),
    reset: vi.fn<AutocompleteClient["reset"]>(),
    on: vi.fn<AutocompleteClient["on"]>(() => () => undefined),
  } satisfies AutocompleteClient;
}

let client = fakeClient();

const suggestion: BusinessSuggestion = {
  type: "business",
  token: "tok-osiris-ratings",
  label: "OSIRIS RATINGS, INC.",
  matched_name: null,
  match: "strong",
  domicile_state: "DE",
  states: ["DE"],
  related: {
    people: { count: 1, matched: 0, truncated: false, items: [] },
    addresses: { count: 1, matched: 0, truncated: false, items: [] },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [],
};

function result(
  query: string,
  overrides: Partial<SuggestResult> = {},
): SuggestResult {
  return {
    response: {
      query,
      found: 1,
      found_capped: false,
      truncated: false,
      sources: {
        people: { status: "ok" },
        addresses: { status: "ok" },
        liens: { status: "unavailable" },
      },
      suggestions: [suggestion],
    },
    indexTag: "v1/202609131644",
    requestId: null,
    serverTiming: null,
    roundTripMs: 23,
    recovery: "none",
    filtersWithheld: false,
    ...overrides,
  };
}

/** The console's `AutocompleteRequestError(status, message, reason)`. */
function requestFailed(
  status: number,
  message: string,
  reason: string | null,
): AutocompleteError {
  return new AutocompleteError({
    kind: "request_failed",
    message,
    status,
    reason,
    userMessage: message,
  });
}

/** The console's `AutocompleteSessionsUnavailableError(until)`. */
function sessionsUnavailable(until: number): AutocompleteError {
  return new AutocompleteError({
    kind: "session_unavailable",
    message: "Autocomplete sessions are not configured on this deployment",
    status: 503,
    code: 481,
    until,
  });
}

/** The console's `AutocompleteMintBackoffError(until, dayLimit)`. */
function mintBackoff(until: number, dayLimit = false): AutocompleteError {
  return new AutocompleteError({
    kind: "mint_backoff",
    message: "Waiting before asking for another autocomplete session",
    status: 429,
    until,
    scope: dayLimit ? "day" : "window",
  });
}

function renderQuery(initialQuery: string) {
  return renderHook(
    (props: { query: string }) =>
      useBusinessAutocomplete({ query: props.query, enabled: true, client }),
    { initialProps: { query: initialQuery } },
  );
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
  });
}

async function advancePast(until: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(until - Date.now() + 1);
  });
}

describe("useBusinessAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    client = fakeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does nothing under three characters", async () => {
    const { result: hook } = renderQuery("os");
    await settle();

    expect(client.suggest).not.toHaveBeenCalled();
    expect(hook.current).toEqual(EMPTY_AUTOCOMPLETE_STATE);
  });

  it("does nothing while disabled", async () => {
    renderHook(() =>
      useBusinessAutocomplete({ query: "osiris", enabled: false, client }),
    );
    await settle();

    expect(client.suggest).not.toHaveBeenCalled();
  });

  it("debounces to one request carrying the last keystroke, and only the name", async () => {
    client.suggest.mockResolvedValue(result("osir"));
    const { result: hook, rerender } = renderQuery("osi");
    act(() => {
      vi.advanceTimersByTime(DEBOUNCE_MS - 50);
    });
    rerender({ query: " osir " });
    await settle();

    expect(client.suggest).toHaveBeenCalledTimes(1);
    // The SDK hook also sends its row count (the default five).
    expect(client.suggest.mock.calls[0]?.[0]).toEqual({ q: "osir", limit: 5 });
    expect(hook.current.suggestions).toEqual([suggestion]);
    expect(hook.current.found).toBe(1);
    expect(hook.current.indexTag).toBe("v1/202609131644");
    expect(hook.current.roundTripMs).toBe(23);
    expect(hook.current.isSearching).toBe(false);
    expect(hook.current.error).toBeNull();
  });

  it("drops a superseded reply and keeps the rows in place while the next is in flight", async () => {
    let resolveFirst: (value: SuggestResult) => void = () => undefined;
    client.suggest
      .mockImplementationOnce(
        () =>
          new Promise<SuggestResult>(resolve => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(
        result("osiris", {
          response: {
            ...result("osiris").response,
            found: 7,
            found_capped: true,
          },
        }),
      );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.isSearching).toBe(true);
    const firstSignal = client.suggest.mock.calls[0]?.[1]?.signal;

    rerender({ query: "osiris" });
    expect(firstSignal?.aborted).toBe(true);
    await settle();
    // The stale reply lands after the newer request was issued: ignored.
    await act(async () => {
      resolveFirst(result("osir"));
      await Promise.resolve();
    });

    expect(client.suggest).toHaveBeenCalledTimes(2);
    expect(hook.current.found).toBe(7);
    expect(hook.current.foundCapped).toBe(true);
  });

  it("reports a failed request, clears the rows and the previous reply's diagnostics", async () => {
    client.suggest
      .mockResolvedValueOnce(result("osir"))
      .mockRejectedValueOnce(
        requestFailed(503, "Autocomplete unavailable (HTTP 503)", null),
      );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.suggestions).toHaveLength(1);
    expect(hook.current.roundTripMs).toBe(23);

    rerender({ query: "osiris" });
    await settle();

    expect(hook.current.suggestions).toEqual([]);
    expect(hook.current.error).toBe("Autocomplete unavailable (HTTP 503)");
    expect(hook.current.isSearching).toBe(false);
    // The 23 ms and the index tag described the reply that succeeded; shown
    // next to this error they would describe nothing.
    expect(hook.current.roundTripMs).toBeNull();
    expect(hook.current.indexTag).toBeNull();
  });

  it("shows the tier's own message and a short fallback for anything else", async () => {
    client.suggest
      .mockRejectedValueOnce(
        requestFailed(
          429,
          "Too many requests. Please try again later.",
          "rate_limited",
        ),
      )
      // A contract drift: the SDK's validator names the path it choked on.
      .mockRejectedValueOnce(
        new AutocompleteError({
          kind: "contract",
          message:
            "Unexpected autocomplete response: response.suggestions[0].label: expected a string",
          status: 200,
        }),
      )
      // The mint failing with axios's text, as the session manager reports it.
      .mockRejectedValueOnce(
        new AutocompleteError({
          kind: "mint_refused",
          message: "Request failed with status code 503",
          status: 0,
          userMessage: "Request failed with status code 503",
        }),
      );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.error).toBe(
      "Too many requests. Please try again later.",
    );

    rerender({ query: "osiri" });
    await settle();
    expect(hook.current.error).toBe("Autocomplete unavailable");

    rerender({ query: "osiris" });
    await settle();
    expect(hook.current.error).toBe("Autocomplete unavailable");
  });

  it("clears the previous error the moment the retry is issued", async () => {
    let resolveRetry: (value: SuggestResult) => void = () => undefined;
    client.suggest
      .mockRejectedValueOnce(
        requestFailed(503, "Autocomplete unavailable (HTTP 503)", null),
      )
      .mockImplementationOnce(
        () =>
          new Promise<SuggestResult>(resolve => {
            resolveRetry = resolve;
          }),
      );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.error).toBe("Autocomplete unavailable (HTTP 503)");

    // The next keystroke: the request is in flight, nothing has come back yet.
    rerender({ query: "osiri" });
    await settle();

    expect(hook.current.isSearching).toBe(true);
    expect(hook.current.error).toBeNull();

    await act(async () => {
      resolveRetry(result("osiri"));
      await Promise.resolve();
    });
    expect(hook.current.suggestions).toHaveLength(1);
    expect(hook.current.error).toBeNull();
  });

  it("reports the sessions as unavailable when the mint says they are not configured", async () => {
    client.suggest.mockRejectedValueOnce(
      sessionsUnavailable(Date.now() + 60_000),
    );
    const { result: hook } = renderQuery("osir");
    await settle();

    // Not an error to show in a footer: the typeahead steps aside for the
    // plain input, and nothing is left to render a row or a count for.
    expect(hook.current.unavailable).toBe(true);
    expect(hook.current.error).toBeNull();
    expect(hook.current.suggestions).toEqual([]);
    expect(hook.current.isSearching).toBe(false);
    expect(hook.current.errorKind).toBe("session_unavailable");
  });

  it("tells the user when the plan's day is spent, and comes back when it ends", async () => {
    const until = Date.now() + 6 * 60 * 60_000;
    client.suggest.mockRejectedValueOnce(mintBackoff(until, true));
    const { result: hook } = renderQuery("osiris");
    await settle();

    // The day is the plan's reach, spent until tomorrow: something to say,
    // unlike the window's wait. The field stays a typeahead, with the footer.
    expect(hook.current.error).toBe(DEFAULT_MESSAGES.dayLimit);
    expect(hook.current.unavailable).toBe(false);
    expect(hook.current.suggestions).toEqual([]);

    client.suggest.mockResolvedValue(result("osiris"));
    await advancePast(until);
    await settle();

    expect(hook.current.error).toBeNull();
    expect(hook.current.suggestions).toHaveLength(1);
  });

  it("waits out a spent window in silence", async () => {
    client.suggest.mockRejectedValueOnce(mintBackoff(Date.now() + 60_000));
    const { result: hook } = renderQuery("osiris");
    await settle();

    expect(hook.current.error).toBeNull();
    expect(hook.current.unavailable).toBe(false);
    expect(hook.current.suggestions).toEqual([]);
  });

  it("stops reporting unavailable as soon as it is querying again", async () => {
    // `unavailable` was spread forward out of UNAVAILABLE_STATE by the "now
    // searching" update, so it stayed true for the whole of the first fetch
    // after the cooldown ended, and `unavailable` is what swaps the field for
    // the plain input, so the typeahead visibly fell back mid-recovery.
    client.suggest.mockRejectedValueOnce(
      sessionsUnavailable(Date.now() + 60_000),
    );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.unavailable).toBe(true);

    // The cooldown has passed and the next keystroke is in flight, not settled.
    client.getSnapshot.mockReturnValue(IDLE);
    let release!: (value: SuggestResult) => void;
    client.suggest.mockReturnValueOnce(
      new Promise<SuggestResult>(resolve => {
        release = resolve;
      }),
    );
    rerender({ query: "osiri" });
    await settle();

    expect(hook.current.isSearching).toBe(true);
    expect(hook.current.unavailable).toBe(false);

    await act(async () => {
      release(result("osiri"));
      await Promise.resolve();
    });
    expect(hook.current.unavailable).toBe(false);
    expect(hook.current.suggestions).toHaveLength(1);
  });

  it("does not reach the tier while the sessions are known to be unavailable", async () => {
    // The prewarm on focus already learnt it, before any keystroke.
    client.getSnapshot.mockReturnValue(
      snapshotWith({ phase: "unavailable", until: Date.now() + 60_000 }),
    );
    const { result: hook } = renderQuery("osiris");
    await settle();

    expect(client.suggest).not.toHaveBeenCalled();
    expect(hook.current.unavailable).toBe(true);
  });

  it("comes back the moment a cooldown learnt on focus ends, not on the next keystroke", async () => {
    const until = Date.now() + 60_000;
    client.getSnapshot.mockReturnValue(
      snapshotWith({ phase: "unavailable", until }),
    );
    client.suggest.mockResolvedValue(result("osiris"));
    const { result: hook } = renderQuery("osiris");
    await settle();
    expect(hook.current.unavailable).toBe(true);
    expect(client.suggest).not.toHaveBeenCalled();

    // Nothing is typed. Left to the next keystroke, `unavailable` would
    // outlive the cooldown and the field would stay the plain input; the
    // hook re-reads the cooldown itself when it ends.
    client.getSnapshot.mockReturnValue(IDLE);
    await advancePast(until);
    await settle();

    expect(hook.current.unavailable).toBe(false);
    expect(client.suggest).toHaveBeenCalledTimes(1);
    expect(hook.current.suggestions).toHaveLength(1);
  });

  it("comes back the moment a cooldown learnt from a refused fetch ends", async () => {
    const until = Date.now() + 60_000;
    client.suggest.mockRejectedValueOnce(sessionsUnavailable(until));
    const { result: hook } = renderQuery("osiris");
    await settle();
    expect(hook.current.unavailable).toBe(true);

    client.suggest.mockResolvedValue(result("osiris"));
    await advancePast(until);
    await settle();

    expect(hook.current.unavailable).toBe(false);
    expect(client.suggest).toHaveBeenCalledTimes(2);
  });

  it("resets when the query falls under the floor", async () => {
    client.suggest.mockResolvedValue(result("osir"));
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.suggestions).toHaveLength(1);

    rerender({ query: "os" });

    expect(hook.current).toEqual(EMPTY_AUTOCOMPLETE_STATE);
  });
});

describe("useBusinessAutocomplete, the SDK's own failures", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    client = fakeClient();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("says the session could not be verified while the auth brake holds", async () => {
    client.suggest.mockRejectedValueOnce(
      new AutocompleteError({
        kind: "auth_braked",
        message: "Autocomplete unavailable: the session could not be verified",
        status: 401,
        reason: "auth_unavailable",
        until: Date.now() + 60_000,
      }),
    );
    const { result: hook } = renderQuery("osiris");
    await settle();

    expect(hook.current.error).toBe(DEFAULT_MESSAGES.authUnavailable);
    expect(hook.current.errorKind).toBe("auth_braked");
    expect(hook.current.unavailable).toBe(false);
    expect(hook.current.suggestions).toEqual([]);
  });

  it("falls back to the status when a refusal carries no message of its own", async () => {
    client.suggest
      .mockRejectedValueOnce(
        new AutocompleteError({
          kind: "request_failed",
          message: "Autocomplete unavailable (HTTP 502)",
          status: 502,
        }),
      )
      // A network failure has no status to name.
      .mockRejectedValueOnce(
        new AutocompleteError({
          kind: "request_failed",
          message: "Autocomplete unavailable",
          status: 0,
        }),
      );
    const { result: hook, rerender } = renderQuery("osir");
    await settle();
    expect(hook.current.error).toBe(DEFAULT_MESSAGES.httpFallback(502));
    expect(hook.current.error).toBe("Autocomplete unavailable (HTTP 502)");
    expect(hook.current.errorKind).toBe("request_failed");

    rerender({ query: "osiri" });
    await settle();
    expect(hook.current.error).toBe(DEFAULT_MESSAGES.unavailable);
  });

  it.each([
    [
      "mint_refused",
      new AutocompleteError({
        kind: "mint_refused",
        message: "Organization is deactivated",
        status: 403,
        userMessage: "Organization is deactivated",
      }),
    ],
    [
      "contract",
      new AutocompleteError({
        kind: "contract",
        message: "Unexpected autocomplete response",
        status: 200,
      }),
    ],
  ] as const)(
    "shows the short fallback for %s, whatever the error says",
    async (kind, error) => {
      client.suggest.mockRejectedValueOnce(error);
      const { result: hook } = renderQuery("osiris");
      await settle();

      expect(hook.current.error).toBe(DEFAULT_MESSAGES.unavailable);
      expect(hook.current.errorKind).toBe(kind);
      expect(hook.current.unavailable).toBe(false);
    },
  );

  it("shows the short fallback for a failure that is not an AutocompleteError", async () => {
    // A host's own client can reject with anything.
    client.suggest.mockRejectedValueOnce(new TypeError("boom"));
    const { result: hook } = renderQuery("osiris");
    await settle();

    expect(hook.current.error).toBe(DEFAULT_MESSAGES.unavailable);
    expect(hook.current.errorKind).toBeNull();
  });

  it("says nothing about a query the tier would refuse", async () => {
    client.suggest.mockRejectedValueOnce(
      new AutocompleteError({
        kind: "query_invalid",
        message: "q must be 2 to 256 characters",
      }),
    );
    const { result: hook } = renderQuery("%%%");
    await settle();

    expect(hook.current.error).toBeNull();
    expect(hook.current.errorKind).toBe("query_invalid");
    expect(hook.current.suggestions).toEqual([]);
  });

  it("does not refire the request for a fresh messages object on every render", async () => {
    client.suggest.mockRejectedValue(
      new AutocompleteError({
        kind: "request_failed",
        message: "Autocomplete unavailable (HTTP 502)",
        status: 502,
      }),
    );
    const { result: hook, rerender } = renderHook(
      (props: { tick: number }) =>
        useBusinessAutocomplete({
          query: "osiris",
          enabled: true,
          client,
          // A new object, with a new function in it, on every render.
          messages: {
            httpFallback: status => `Down (${status}, render ${props.tick})`,
          },
        }),
      { initialProps: { tick: 0 } },
    );
    await settle();
    expect(hook.current.error).toBe("Down (502, render 0)");

    rerender({ tick: 1 });
    await settle();
    rerender({ tick: 2 });
    await settle();

    expect(client.suggest).toHaveBeenCalledTimes(1);
  });

  it("sends the filters, the relations and the limit, and does not refire for equal filters", async () => {
    client.suggest.mockResolvedValue(result("osiris"));
    const initial: Filters = { state: ["DE"], address: { city: "Dover" } };
    const { rerender } = renderHook(
      (props: { filters: Filters }) =>
        useBusinessAutocomplete({
          query: "osiris",
          enabled: true,
          client,
          filters: props.filters,
          include: ["people", "addresses"],
          limit: 8,
        }),
      {
        initialProps: { filters: initial },
      },
    );
    await settle();

    expect(client.suggest).toHaveBeenCalledTimes(1);
    expect(client.suggest.mock.calls[0]?.[0]).toEqual({
      q: "osiris",
      limit: 8,
      include: ["people", "addresses"],
      filters: { state: ["DE"], address: { city: "Dover" } },
    });

    // A new object saying the same thing, and a new include array with it.
    rerender({ filters: { state: ["DE"], address: { city: "Dover" } } });
    await settle();
    expect(client.suggest).toHaveBeenCalledTimes(1);

    rerender({ filters: { state: ["DE", "FL"] } });
    await settle();
    expect(client.suggest).toHaveBeenCalledTimes(2);
    expect(client.suggest.mock.calls[1]?.[0]).toEqual({
      q: "osiris",
      limit: 8,
      include: ["people", "addresses"],
      filters: { state: ["DE", "FL"] },
    });
  });

  it("reads the client from the provider", async () => {
    client.suggest.mockResolvedValue(result("osiris"));
    const wrapper = ({ children }: { children: ReactNode }) => (
      <AutocompleteClientProvider client={client}>
        {children}
      </AutocompleteClientProvider>
    );
    const { result: hook } = renderHook(
      () => useBusinessAutocomplete({ query: "osiris", enabled: true }),
      { wrapper },
    );
    await settle();

    expect(client.suggest).toHaveBeenCalledTimes(1);
    expect(hook.current.suggestions).toEqual([suggestion]);
  });

  it("throws when there is no client at all", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        renderHook(() =>
          useBusinessAutocomplete({ query: "osiris", enabled: true }),
        ),
      ).toThrow(/No autocomplete client/);
    } finally {
      quiet.mockRestore();
    }
  });
});
