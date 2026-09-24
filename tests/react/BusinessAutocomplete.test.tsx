import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  createAutocompleteClient,
  type AutocompleteClient,
  type FetchLike,
  type MintFunction,
  type MintOutcome,
  type MintedGrant,
  type ResponseLike,
} from "@baselayer/autocomplete";

import {
  BusinessAutocomplete,
  useAutocompleteSession,
  type BusinessAutocompleteProps,
} from "../../src/react";

const BASE_URL = "https://api.example.test";
const MINT_URL = "/api/autocomplete-session";

const GRANT: MintedGrant = {
  sessionToken: "sess-1",
  expiresIn: 300,
  requestBudget: 50,
  pivotAllowance: 5,
  filterMinStem: 3,
};

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): ResponseLike {
  const lower = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: name => lower.get(name.toLowerCase()) ?? null },
    json: async () => body,
  };
}

function wireSuggestion(token: string, label: string) {
  return {
    type: "business",
    token,
    label,
    matched_name: null,
    match: "strong",
    domicile_state: "DE",
    states: ["DE"],
    related: {
      people: { count: 0, matched: null, truncated: false, items: [] },
      addresses: {
        count: 1,
        matched: null,
        truncated: false,
        items: [
          {
            type: "address",
            token: "tok-address",
            label: "1 Main St, Dover, DE 19901",
            role: "principal",
            matched: false,
          },
        ],
      },
      liens: { count: null, matched: null, truncated: false, items: [] },
    },
    highlight: [],
  };
}

function businessesBody(q: string) {
  return {
    query: q,
    found: 2,
    found_capped: false,
    truncated: false,
    sources: {
      people: { status: "ok" },
      addresses: { status: "ok" },
      liens: { status: "not_requested" },
    },
    suggestions: [
      wireSuggestion("tok-cinder-rigging", "CINDER RIGGING, INC."),
      wireSuggestion("tok-cinder-racing", "CINDER RACING STABLES, LLC"),
    ],
  };
}

function isTierCall(url: string): boolean {
  return url.startsWith(`${BASE_URL}/autocomplete/businesses`);
}

function queryOf(url: string): string | null {
  return new URL(url).searchParams.get("q");
}

/** The tier: answers every keystroke with two rows. */
function tierFetch() {
  return vi.fn<FetchLike>(async url => {
    if (!isTierCall(url)) {
      throw new Error(`unexpected fetch ${url}`);
    }
    return jsonResponse(200, businessesBody(queryOf(url) ?? ""), {
      "X-Autocomplete-Index": "v9/202609140305",
    });
  });
}

function grantingMint() {
  return vi.fn<MintFunction>(async (): Promise<MintOutcome> => ({
    kind: "granted",
    grant: GRANT,
  }));
}

type Source =
  | { client: AutocompleteClient }
  | { mint: MintFunction; baseUrl: string }
  | { mintUrl: string; baseUrl: string };

type HostProps = Omit<
  BusinessAutocompleteProps,
  | "client"
  | "mint"
  | "mintUrl"
  | "baseUrl"
  | "id"
  | "value"
  | "onChange"
  | "onPick"
> & {
  source: Source;
  onChange?: BusinessAutocompleteProps["onChange"];
  onPick?: BusinessAutocompleteProps["onPick"];
};

/** A form field that owns the value, as a host's would. */
function Host({ source, onChange, onPick, ...rest }: HostProps) {
  const [value, setValue] = useState("");
  return (
    <BusinessAutocomplete
      {...source}
      {...rest}
      id="businessName"
      label="Business name"
      value={value}
      debounceMs={0}
      onChange={next => {
        onChange?.(next);
        setValue(next);
      }}
      onPick={(suggestion, pick) => onPick?.(suggestion, pick)}
    />
  );
}

function input(): HTMLInputElement {
  return screen.getByRole("combobox");
}

/** Long enough for a zero debounce, a mint and a reply to have happened. */
function aMoment() {
  return act(() => new Promise(resolve => setTimeout(resolve, 30)));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BusinessAutocomplete", () => {
  it("mints once for a burst of keystrokes and shows the rows", async () => {
    // The `mint` + `baseUrl` path: the component owns its client, and the
    // tier is reached through the page's `fetch`.
    const fetch = tierFetch();
    vi.stubGlobal("fetch", fetch);
    const mint = grantingMint();
    const user = userEvent.setup();
    render(<Host source={{ mint, baseUrl: BASE_URL }} mintOn="request" />);

    await user.type(input(), "cinder");

    const rows = await screen.findAllByTestId("business-suggestion");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("CINDER RIGGING, INC.");
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0].reason).toBe("cold");
    // Nothing under the floor reached the tier.
    const queries = fetch.mock.calls.map(([url]) => queryOf(url));
    expect(queries).not.toContain("o");
    expect(queries).not.toContain("os");
    expect(queries.at(-1)).toBe("cinder");
    expect(fetch.mock.calls.at(-1)?.[1].headers).toMatchObject({
      "X-Autocomplete-Session": "sess-1",
    });
  });

  it("asks the tier for what its parts show, and no more", async () => {
    const fetch = tierFetch();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <Host
        source={{ mint: grantingMint(), baseUrl: BASE_URL }}
        mintOn="request"
        parts={{ subtitle: false }}
      />,
    );

    await user.type(input(), "cinder");
    await screen.findAllByTestId("business-suggestion");

    const url = new URL(fetch.mock.calls.at(-1)?.[0] ?? "");
    expect(url.searchParams.get("include")).toBe("people");
  });

  it("leaves include to the tier when no part needs a related entity", async () => {
    const fetch = tierFetch();
    vi.stubGlobal("fetch", fetch);
    const user = userEvent.setup();
    render(
      <Host
        source={{ mint: grantingMint(), baseUrl: BASE_URL }}
        mintOn="request"
        parts={{ subtitle: false, secondarySubtitle: false }}
      />,
    );

    await user.type(input(), "cinder");
    await screen.findAllByTestId("business-suggestion");

    // An empty include is refused by the tier, so none is sent.
    const url = new URL(fetch.mock.calls.at(-1)?.[0] ?? "");
    expect(url.searchParams.has("include")).toBe(false);
  });

  it("keeps its rows on screen after the field loses focus while held open", async () => {
    vi.stubGlobal("fetch", tierFetch());
    const user = userEvent.setup();
    render(
      <>
        <Host
          source={{ mint: grantingMint(), baseUrl: BASE_URL }}
          mintOn="request"
          open
        />
        <button type="button">elsewhere</button>
      </>,
    );

    await user.type(input(), "cinder");
    await screen.findAllByTestId("business-suggestion");
    await user.click(screen.getByRole("button", { name: "elsewhere" }));

    expect(input()).not.toHaveFocus();
    expect(screen.getAllByTestId("business-suggestion")).toHaveLength(2);
  });

  it("draws only the parts of a row it is given", async () => {
    vi.stubGlobal("fetch", tierFetch());
    const user = userEvent.setup();
    render(
      <Host
        source={{ mint: grantingMint(), baseUrl: BASE_URL }}
        mintOn="request"
        parts={{ subtitle: false }}
      />,
    );

    await user.type(input(), "cinder");
    const rows = await screen.findAllByTestId("business-suggestion");

    expect(rows[0]).toHaveTextContent("CINDER RIGGING, INC.");
    expect(screen.queryAllByTestId("business-suggestion-address")).toHaveLength(
      0,
    );
  });

  it("hands the host the pick and its token, and does not query the picked name", async () => {
    const fetch = tierFetch();
    const mint = grantingMint();
    const client = createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch });
    const onChange = vi.fn<BusinessAutocompleteProps["onChange"]>();
    const onPick = vi.fn<BusinessAutocompleteProps["onPick"]>();
    const user = userEvent.setup();
    render(<Host source={{ client }} onChange={onChange} onPick={onPick} />);

    await user.type(input(), "cind");
    await screen.findAllByTestId("business-suggestion");
    const before = Date.now();
    await user.click(screen.getByText("CINDER RACING STABLES, LLC"));
    const after = Date.now();

    expect(onChange).toHaveBeenLastCalledWith("CINDER RACING STABLES, LLC");
    expect(input()).toHaveValue("CINDER RACING STABLES, LLC");
    expect(onPick).toHaveBeenCalledTimes(1);
    const [picked, pick] = onPick.mock.calls[0]!;
    expect(picked.token).toBe("tok-cinder-racing");
    expect(picked.label).toBe("CINDER RACING STABLES, LLC");
    expect(pick.businessToken).toBe("tok-cinder-racing");
    expect(pick.pickedAt).toBeGreaterThanOrEqual(before);
    expect(pick.pickedAt).toBeLessThanOrEqual(after);
    expect(pick.expiresAt - pick.pickedAt).toBe(900_000);
    expect(pick.expiresAt - pick.pickedAt).toBe(
      BUSINESS_TOKEN_TTL_SECONDS * 1000,
    );

    // The field now holds the label, which is not a query.
    await aMoment();
    const queried = () => fetch.mock.calls.map(([url]) => queryOf(url));
    expect(queried()).not.toContain("CINDER RACING STABLES, LLC");
    expect(screen.queryAllByTestId("business-suggestion")).toHaveLength(0);

    // Editing the name is typing again.
    await user.type(input(), "{Backspace}");
    await waitFor(() =>
      expect(queried()).toContain("CINDER RACING STABLES, LL"),
    );
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints when the field takes focus, and the first keystroke uses that grant", async () => {
    const fetch = tierFetch();
    const mint = grantingMint();
    const client = createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch });
    const user = userEvent.setup();
    render(<Host source={{ client }} />);

    await user.click(input());

    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    expect(mint.mock.calls[0]?.[0].reason).toBe("prewarm");
    expect(fetch).not.toHaveBeenCalled();

    await user.type(input(), "cinder");
    await screen.findAllByTestId("business-suggestion");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints on the first keystroke, not on focus, under mintOn keystroke", async () => {
    const fetch = tierFetch();
    const mint = grantingMint();
    const client = createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch });
    const user = userEvent.setup();
    render(<Host source={{ client }} mintOn="keystroke" />);

    await user.click(input());
    await aMoment();
    expect(mint).not.toHaveBeenCalled();

    // One character is short of asking, but it is a keystroke.
    await user.type(input(), "o");
    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    expect(mint.mock.calls[0]?.[0].reason).toBe("prewarm");
    expect(fetch).not.toHaveBeenCalled();

    await user.type(input(), "siris");
    await screen.findAllByTestId("business-suggestion");
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("mints with the first request, and not before, under mintOn request", async () => {
    const fetch = tierFetch();
    const mint = grantingMint();
    const client = createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch });
    const user = userEvent.setup();
    render(<Host source={{ client }} mintOn="request" />);

    await user.click(input());
    await user.type(input(), "os");
    await aMoment();
    expect(mint).not.toHaveBeenCalled();

    await user.type(input(), "iris");
    await screen.findAllByTestId("business-suggestion");
    expect(mint).toHaveBeenCalledTimes(1);
    expect(mint.mock.calls[0]?.[0].reason).toBe("cold");
  });

  it("never mints, nor asks the tier, while disabled", async () => {
    const fetch = tierFetch();
    const mint = grantingMint();
    const client = createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch });
    const onChange = vi.fn<BusinessAutocompleteProps["onChange"]>();
    const user = userEvent.setup();
    render(<Host source={{ client }} enabled={false} onChange={onChange} />);

    await user.type(input(), "cinder");
    await aMoment();

    // Still a field: the typing reaches the host.
    expect(onChange).toHaveBeenLastCalledWith("cinder");
    expect(input()).toHaveValue("cinder");
    expect(mint).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryAllByTestId("business-suggestion")).toHaveLength(0);
  });

  it("tells the host when the deployment cannot mint, and never asks the tier", async () => {
    // The `mintUrl` path: `defaultMint` posts to the host's backend, which
    // passes the API's 503 with code 481 through.
    const fetch = vi.fn<
      (url: string, init?: { method?: string }) => Promise<ResponseLike>
    >(async url =>
      url === MINT_URL
        ? jsonResponse(503, {
            code: 481,
            message: "Autocomplete sessions are not configured",
            metadata: null,
          })
        : jsonResponse(200, businessesBody(queryOf(url) ?? "")),
    );
    vi.stubGlobal("fetch", fetch);
    const onUnavailable = vi.fn();
    const user = userEvent.setup();
    render(
      <Host
        source={{ mintUrl: MINT_URL, baseUrl: BASE_URL }}
        onUnavailable={onUnavailable}
      />,
    );

    await user.type(input(), "cinder");

    await waitFor(() =>
      expect(onUnavailable).toHaveBeenCalledWith({ unavailable: true }),
    );
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    const urls = fetch.mock.calls.map(([url]) => url);
    expect(urls).toEqual([MINT_URL]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    expect(screen.queryAllByTestId("business-suggestion")).toHaveLength(0);
  });
});

function SessionProbe({ client }: { client: AutocompleteClient }) {
  const { snapshot, unavailable, unavailableUntil } =
    useAutocompleteSession(client);
  return (
    <output data-testid="session">
      {snapshot.session.phase}
      {unavailable ? ` unavailable until ${unavailableUntil}` : ""}
    </output>
  );
}

describe("useAutocompleteSession", () => {
  it("re-renders on every change of the session", async () => {
    let release: (outcome: MintOutcome) => void = () => undefined;
    const mint = vi.fn<MintFunction>(
      () =>
        new Promise<MintOutcome>(resolve => {
          release = resolve;
        }),
    );
    const client = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint,
      fetch: tierFetch(),
    });
    render(<SessionProbe client={client} />);
    const session = screen.getByTestId("session");
    expect(session).toHaveTextContent("idle");

    act(() => client.prewarm());
    expect(session).toHaveTextContent("minting");

    act(() => release({ kind: "granted", grant: GRANT }));
    await waitFor(() => expect(session).toHaveTextContent("ready"));

    act(() => client.reset());
    expect(session).toHaveTextContent("idle");
  });

  it("says the sessions are unavailable, and until when, after a 481 mint", async () => {
    const mint = vi.fn<MintFunction>(async () => ({
      kind: "refused",
      status: 503,
      code: 481,
      retryAfterSeconds: null,
      scope: null,
      message: "Autocomplete sessions are not configured",
    }));
    const client = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint,
      fetch: tierFetch(),
    });
    render(<SessionProbe client={client} />);

    act(() => client.prewarm());

    const session = screen.getByTestId("session");
    await waitFor(() => expect(session).toHaveTextContent(/^unavailable/));
    const until = client.getSnapshot().session;
    expect(until.phase).toBe("unavailable");
    expect(session).toHaveTextContent(
      `unavailable until ${until.phase === "unavailable" ? until.until : ""}`,
    );
  });
});
