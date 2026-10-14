import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createAutocompleteClient,
  type AutocompleteClientConfig,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import {
  AddressAutocomplete,
  BusinessAutocomplete,
  PersonAutocomplete,
} from "../../src/react";
import { golden, type GoldenName } from "../core/fixtures/golden";

// What the person typing sees while a filter waits for the session's stem, in
// each field. The grant's stem is 5.

const SCOPE: SessionScope = {
  routes: {
    businesses: ["people", "addresses"],
    people: ["businesses", "addresses"],
    addresses: ["businesses", "people"],
  },
  maxLimit: 20,
};

type Route = "businesses" | "people" | "addresses";

interface FieldCase {
  route: Route;
  answer: GoldenName;
  /** What is typed, one character at a time: the stem is its fifth. */
  typed: string;
  /** The query parameter the filter travels as. */
  param: string;
}

const FIELDS: FieldCase[] = [
  { route: "businesses", answer: "businesses", typed: "halcy", param: "state" },
  {
    route: "people",
    answer: "people",
    typed: "maris",
    param: "business.state",
  },
  { route: "addresses", answer: "addresses", typed: "piers", param: "state" },
];

function reply(body: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

function setup(config: Partial<AutocompleteClientConfig> = {}) {
  const fetch = vi.fn<FetchLike>(async url => {
    const field = FIELDS.find(f => url.includes(`/autocomplete/${f.route}`));
    return reply(golden(field?.answer ?? "businesses"));
  });
  const mint = vi.fn<MintFunction>(async () => ({
    kind: "granted",
    grant: {
      sessionToken: "grant-1",
      expiresIn: 600,
      requestBudget: 50,
      pivotAllowance: 5,
      filterMinStem: 5,
      scope: SCOPE,
    },
  }));
  return {
    fetch,
    client: createAutocompleteClient({
      baseUrl: "https://api.test",
      mint,
      fetch,
      ...config,
    }),
  };
}

type Client = ReturnType<typeof setup>["client"];

function Field({
  route,
  client,
  filtered,
}: {
  route: Route;
  client: Client;
  filtered: boolean;
}) {
  const [value, setValue] = useState("");
  const common = {
    id: route,
    label: route,
    client,
    value,
    onChange: setValue,
    debounceMs: 0,
  };
  switch (route) {
    case "businesses":
      return (
        <BusinessAutocomplete
          {...common}
          onPick={() => {}}
          {...(filtered ? { filters: { state: ["DE"] } } : {})}
        />
      );
    case "people":
      return (
        <PersonAutocomplete
          {...common}
          onPick={() => {}}
          {...(filtered ? { filters: { business: { state: ["DE"] } } } : {})}
        />
      );
    case "addresses":
      return (
        <AddressAutocomplete
          {...common}
          onPick={() => {}}
          {...(filtered ? { filters: { state: ["DE"] } } : {})}
        />
      );
  }
}

function aMoment() {
  return act(() => new Promise(resolve => setTimeout(resolve, 30)));
}

function sentUrls(fetch: ReturnType<typeof setup>["fetch"]): URL[] {
  return fetch.mock.calls.map(([url]) => new URL(String(url)));
}

describe.each(FIELDS)("the $route field, with a filter set", field => {
  const open = async (config: Partial<AutocompleteClientConfig> = {}) => {
    const { client, fetch } = setup(config);
    render(<Field route={field.route} client={client} filtered />);
    const user = userEvent.setup();
    const input = screen.getByRole("combobox");
    await user.click(input);
    return { user, input, fetch };
  };

  it("sends nothing and shows nothing at 3 and 4 characters", async () => {
    const { user, fetch } = await open();

    await user.keyboard(field.typed.slice(0, 3));
    await aMoment();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.queryByText("Searching…")).toBeNull();

    await user.keyboard(field.typed.slice(3, 4));
    await aMoment();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.queryByText("Searching…")).toBeNull();
  });

  it("asks with the filter, and shows the rows, at 5", async () => {
    const { user, fetch } = await open();

    await user.keyboard(field.typed);

    expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
    const urls = sentUrls(fetch);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.get("q")).toBe(field.typed);
    expect(urls[0]?.searchParams.get(field.param)).toBe("DE");
  });

  it("empties the menu again when a character is deleted, and asks nothing more", async () => {
    const { user, fetch } = await open();
    await user.keyboard(field.typed);
    await screen.findAllByRole("option");

    await user.keyboard("{Backspace}");
    await aMoment();

    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("shows the unfiltered rows at 3 and 4 under onShortStem: withhold", async () => {
    const { user, fetch } = await open({ onShortStem: "withhold" });

    await user.keyboard(field.typed.slice(0, 3));

    expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
    const urls = sentUrls(fetch);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.has(field.param)).toBe(false);
  });
});

describe.each(FIELDS)("the $route field, with no filter set", field => {
  it("shows its rows at 3 characters, as before", async () => {
    const { client, fetch } = setup();
    render(<Field route={field.route} client={client} filtered={false} />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("combobox"));
    await user.keyboard(field.typed.slice(0, 3));

    expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
    const urls = sentUrls(fetch);
    expect(urls).toHaveLength(1);
    expect(urls[0]?.searchParams.has(field.param)).toBe(false);
  });
});
