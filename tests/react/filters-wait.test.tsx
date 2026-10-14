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
  type AutocompleteMessages,
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

function setup(
  config: Partial<AutocompleteClientConfig> = {},
  /** Held back until the test lets the session through. */
  gate: Promise<void> = Promise.resolve(),
  /** What the session says besides the default stem of 5. */
  grant: Record<string, unknown> = {},
) {
  const fetch = vi.fn<FetchLike>(async url => {
    const field = FIELDS.find(f => url.includes(`/autocomplete/${f.route}`));
    return reply(golden(field?.answer ?? "businesses"));
  });
  const mint = vi.fn<MintFunction>(async () => {
    await gate;
    return {
      kind: "granted",
      grant: {
        sessionToken: "grant-1",
        expiresIn: 600,
        requestBudget: 50,
        pivotAllowance: 5,
        filterMinStem: 5,
        scope: SCOPE,
        ...grant,
      },
    };
  });
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
  messages,
  filters,
}: {
  route: Route;
  client: Client;
  filtered: boolean;
  messages?: Partial<AutocompleteMessages>;
  filters?: object;
}) {
  const [value, setValue] = useState("");
  const common = {
    id: route,
    label: route,
    client,
    value,
    onChange: setValue,
    debounceMs: 0,
    ...(messages !== undefined ? { messages } : {}),
  };
  switch (route) {
    case "businesses":
      return (
        <BusinessAutocomplete
          {...common}
          onPick={() => {}}
          {...(filtered
            ? { filters: (filters ?? { state: ["DE"] }) as never }
            : {})}
        />
      );
    case "people":
      return (
        <PersonAutocomplete
          {...common}
          onPick={() => {}}
          {...(filtered
            ? { filters: (filters ?? { business: { state: ["DE"] } }) as never }
            : {})}
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

    // At once: the held session already says this query waits.
    expect(screen.queryAllByRole("option")).toEqual([]);
    expect(screen.queryByText("Searching…")).toBeNull();
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

describe.each(FIELDS)(
  "the $route field, on a session still being minted",
  field => {
    it("never shows a search state for a filtered query whose filters wait", async () => {
      let letThrough: () => void = () => {};
      const gate = new Promise<void>(resolve => (letThrough = resolve));
      const { client, fetch } = setup({}, gate);
      render(<Field route={field.route} client={client} filtered />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("combobox"));

      await user.keyboard(field.typed.slice(0, 3));
      await aMoment();
      expect(screen.queryByText("Searching…")).toBeNull();

      await act(async () => letThrough());
      await aMoment();
      expect(screen.queryByText("Searching…")).toBeNull();
      expect(screen.queryAllByRole("option")).toEqual([]);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("shows the search state during the mint for a query with no filter, as before", async () => {
      let letThrough: () => void = () => {};
      const gate = new Promise<void>(resolve => (letThrough = resolve));
      const { client } = setup({}, gate);
      render(<Field route={field.route} client={client} filtered={false} />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("combobox"));

      await user.keyboard(field.typed.slice(0, 3));

      expect(await screen.findByText("Searching…")).toBeTruthy();
      await act(async () => letThrough());
      expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
    });
  },
);

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

const HINT = (count: number) =>
  count === 1
    ? "Type 1 more letter to search with your filters"
    : `Type ${count} more letters to search with your filters`;

describe.each(FIELDS)(
  "the $route field's hint while its filter waits",
  field => {
    const show = async (
      grant: Record<string, unknown> = {},
      options: {
        filtered?: boolean;
        filters?: object;
        messages?: Partial<AutocompleteMessages>;
      } = {},
    ) => {
      const { client, fetch } = setup({}, Promise.resolve(), grant);
      render(
        <Field
          route={field.route}
          client={client}
          filtered={options.filtered ?? true}
          {...(options.filters !== undefined
            ? { filters: options.filters }
            : {})}
          {...(options.messages !== undefined
            ? { messages: options.messages }
            : {})}
        />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("combobox"));
      return { user, fetch };
    };

    it("asks for what the session says is missing: 2 more at 3 characters, 1 more at 4, none at 5", async () => {
      const { user } = await show();

      await user.keyboard(field.typed.slice(0, 3));
      expect(await screen.findByText(HINT(2))).toBeTruthy();
      await user.keyboard(field.typed.slice(3, 4));
      expect(await screen.findByText(HINT(1))).toBeTruthy();
      await user.keyboard(field.typed.slice(4));
      await screen.findAllByRole("option");
      expect(screen.queryByText(/more letters? to search/)).toBeNull();
    });

    it("follows the session, not a constant: a stem of 4 asks for 4 minus what is typed", async () => {
      const stem = 4;
      const { user } = await show({
        filterMinStem: stem,
        filterRules: {
          [field.route]: {
            minStem: stem,
            count: field.route === "people" ? "person_name" : "stem",
            gated: "all",
            shortAllowedWith: [],
          },
        },
      });

      await user.keyboard(field.typed.slice(0, 3));

      expect(await screen.findByText(HINT(1))).toBeTruthy();
    });

    it("follows an older API's session, which sends no rules, by its filter stem", async () => {
      const { user } = await show({ filterMinStem: 7 });

      await user.keyboard(field.typed.slice(0, 3));

      expect(await screen.findByText(HINT(4))).toBeTruthy();
    });

    it("says nothing when no filter is set", async () => {
      const { user } = await show({}, { filtered: false });

      await user.keyboard(field.typed.slice(0, 3));
      await screen.findAllByRole("option");

      expect(screen.queryByText(/more letters? to search/)).toBeNull();
    });

    it("is the host's own text when it overrides it", async () => {
      const { user } = await show(
        {},
        { messages: { filtersNeedMore: n => `${n} to go` } },
      );

      await user.keyboard(field.typed.slice(0, 3));

      expect(await screen.findByText("2 to go")).toBeTruthy();
    });
  },
);

describe("the people field's short name beside a business name", () => {
  it("shows no hint and searches, because the service answers it", async () => {
    const { client, fetch } = setup();
    render(
      <Field
        route="people"
        client={client}
        filtered
        filters={{ business: { name: "osiris" } }}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("combobox"));

    await user.keyboard("tim");

    expect((await screen.findAllByRole("option")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/more letters? to search/)).toBeNull();
    expect(
      new URL(String(fetch.mock.calls[0]?.[0])).searchParams.get(
        "business.name",
      ),
    ).toBe("osiris");
  });
});
