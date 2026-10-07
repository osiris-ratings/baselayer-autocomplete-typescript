import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  createAutocompleteClient,
  type BusinessPick,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import {
  AddressAutocomplete,
  DEFAULT_MESSAGES,
  PersonAutocomplete,
} from "../../src/react";

// Made-up people, addresses and businesses.
const BASE_URL = "https://api.example.test";

const SCOPE: SessionScope = {
  routes: {
    businesses: ["people", "addresses"],
    people: ["businesses", "addresses"],
    addresses: ["businesses", "people"],
  },
  maxLimit: 20,
};

function reply(status: number, body: unknown): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

const business = (label: string, token: string | null, role: string) => ({
  type: "business",
  token,
  label,
  role,
  matched: false,
});

const none = { count: null, matched: null, truncated: false, items: [] };

const PEOPLE = {
  query: "dana",
  found: 2,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    addresses: { status: "not_requested" },
  },
  suggestions: [
    {
      type: "person",
      token: "tok-p-dana",
      label: "Dana Whitfield",
      matched_name: null,
      match: "strong",
      highlight: [
        { text: "Dana", matched: true },
        { text: " Whitfield", matched: false },
      ],
      related: {
        businesses: {
          count: 9,
          matched: null,
          truncated: true,
          items: [
            business(
              "Harbor Concrete Pumping Co., Inc.",
              "tok-b-harbor",
              "officer",
            ),
            business("Unsealed Holdings LLC", null, "officer"),
            business("Cobalt Tile Supply LLC", "tok-b-cobalt", "agent"),
          ],
        },
        addresses: none,
      },
    },
    {
      type: "person",
      token: "tok-p-danae",
      label: "Danae Ortega",
      matched_name: null,
      match: "strong",
      highlight: [{ text: "Danae", matched: true }],
      related: {
        businesses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [business("Ortega Masonry LLC", "tok-b-ortega", "officer")],
        },
        addresses: none,
      },
    },
  ],
};

const ADDRESSES = {
  query: "45 ferry",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    people: { status: "not_requested" },
  },
  suggestions: [
    {
      type: "address",
      token: "tok-a-ferry",
      label: "45 Ferry Landing Ste 200, Erie, PA 16507",
      matched_name: null,
      match: "strong",
      highlight: [
        { text: "45 Ferry", matched: true },
        { text: " Landing Ste 200, Erie, PA 16507", matched: false },
      ],
      components: {
        line1: "45 Ferry Landing",
        line2: "Ste 200",
        city: "Erie",
        state: "PA",
        postal_code: "16507",
      },
      related: {
        businesses: {
          count: 412,
          matched: null,
          truncated: true,
          items: [
            business("Ridgeline Freight LLC", "tok-b-ridgeline", "principal"),
            business("Cinder Rigging, Inc.", "tok-b-cinder", "agent"),
          ],
        },
        people: none,
      },
    },
  ],
};

function setup(scope: SessionScope = SCOPE) {
  const fetch = vi.fn<FetchLike>(async url =>
    reply(200, url.includes("/autocomplete/people") ? PEOPLE : ADDRESSES),
  );
  const mint: MintFunction = async () => ({
    kind: "granted",
    grant: {
      sessionToken: "sess-1",
      expiresIn: 300,
      requestBudget: 50,
      pivotAllowance: 5,
      filterMinStem: 3,
      scope,
    },
  });
  return {
    fetch,
    client: createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch }),
  };
}

function aMoment() {
  return act(() => new Promise(resolve => setTimeout(resolve, 30)));
}

function PersonHost({
  client,
  onPick,
}: {
  client: ReturnType<typeof setup>["client"];
  onPick: (pick: BusinessPick) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <PersonAutocomplete
      client={client}
      id="person"
      label="Person"
      value={value}
      debounceMs={0}
      onChange={setValue}
      onPick={onPick}
    />
  );
}

function AddressHost({
  client,
  onPick,
}: {
  client: ReturnType<typeof setup>["client"];
  onPick: (pick: BusinessPick) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <AddressAutocomplete
      client={client}
      id="address"
      label="Address"
      value={value}
      debounceMs={0}
      onChange={setValue}
      onPick={onPick}
    />
  );
}

describe("PersonAutocomplete", () => {
  it("asks the people route for each person's businesses", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    render(<PersonHost client={client} onPick={() => {}} />);

    await user.type(screen.getByRole("combobox"), "dana");
    await screen.findAllByRole("option");

    const url = new URL(fetch.mock.calls.at(-1)![0]);
    expect(url.pathname).toBe("/autocomplete/people");
    expect(url.searchParams.get("include")).toBe("businesses");
  });

  it("draws each person as a group: the name, the count, and the businesses to pick", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<PersonHost client={client} onPick={() => {}} />);

    await user.type(screen.getByRole("combobox"), "dana");
    const dana = await screen.findByRole("group", { name: "Dana Whitfield" });

    expect(within(dana).getByText("9 businesses")).toBeInTheDocument();
    const options = within(dana).getAllByRole("option");
    expect(options.map(option => option.textContent)).toEqual([
      expect.stringContaining("Harbor Concrete Pumping Co., Inc."),
      expect.stringContaining("Cobalt Tile Supply LLC"),
    ]);
    expect(options[0]).toHaveTextContent("officer");
    expect(options[1]).toHaveTextContent("agent");
    // Nine businesses, two to pick: the one the service could not seal is
    // not an option, and is counted among those not shown.
    expect(within(dana).getByText("+7 more not shown")).toBeInTheDocument();
    expect(
      within(dana)
        .getAllByTestId("person-suggestion-match")
        .map(m => m.textContent),
    ).toEqual(["Dana"]);

    const danae = screen.getByRole("group", { name: "Danae Ortega" });
    expect(within(danae).getByText("1 business")).toBeInTheDocument();
    expect(within(danae).queryByText(/more not shown/)).toBeNull();
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("moves through the businesses only, and picks one with the person it came through", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const user = userEvent.setup();
    render(<PersonHost client={client} onPick={onPick} />);

    await user.type(screen.getByRole("combobox"), "dana");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

    expect(onPick).toHaveBeenCalledTimes(1);
    const pick = onPick.mock.calls[0]![0];
    expect(pick).toMatchObject({
      businessToken: "tok-b-ortega",
      businessName: "Ortega Masonry LLC",
      through: { route: "people", role: "officer" },
    });
    expect(pick.through.route === "people" && pick.through.person.label).toBe(
      "Danae Ortega",
    );
    expect(pick.expiresAt - pick.pickedAt).toBe(
      BUSINESS_TOKEN_TTL_SECONDS * 1000,
    );
  });

  it("picks a business with a click", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const user = userEvent.setup();
    render(<PersonHost client={client} onPick={onPick} />);

    await user.type(screen.getByRole("combobox"), "dana");
    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    expect(onPick.mock.calls[0]![0]).toMatchObject({
      businessToken: "tok-b-cobalt",
      through: { route: "people", role: "agent" },
    });
  });

  it("says the search is out of reach when the session's scope leaves people out", async () => {
    const { client, fetch } = setup({
      routes: { businesses: ["people", "addresses"] },
      maxLimit: 20,
    });
    const user = userEvent.setup();
    render(<PersonHost client={client} onPick={() => {}} />);

    await user.type(screen.getByRole("combobox"), "dana");
    await aMoment();

    expect(
      await screen.findByText(DEFAULT_MESSAGES.outOfScope),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("AddressAutocomplete", () => {
  it("draws each address with how many businesses are filed there, each pickable with its role", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} onPick={() => {}} />);

    await user.type(screen.getByRole("combobox"), "45 ferry");
    const ferry = await screen.findByRole("group", {
      name: "45 Ferry Landing Ste 200, Erie, PA 16507",
    });

    expect(new URL(fetch.mock.calls.at(-1)![0]).pathname).toBe(
      "/autocomplete/addresses",
    );
    expect(within(ferry).getByText("412 businesses here")).toBeInTheDocument();
    const options = within(ferry).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Ridgeline Freight LLC");
    expect(options[0]).toHaveTextContent("principal office");
    expect(options[1]).toHaveTextContent("registered agent");
    expect(within(ferry).getByText("+410 more not shown")).toBeInTheDocument();
    expect(screen.getByText("1 address")).toBeInTheDocument();
  });

  it("picks a business with the address it came through", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const user = userEvent.setup();
    render(<AddressHost client={client} onPick={onPick} />);

    await user.type(screen.getByRole("combobox"), "45 ferry");
    await screen.findAllByRole("option");
    await user.keyboard("{ArrowDown}{Enter}");

    const pick = onPick.mock.calls[0]![0];
    expect(pick).toMatchObject({
      businessToken: "tok-b-ridgeline",
      businessName: "Ridgeline Freight LLC",
      through: { route: "addresses", role: "principal" },
    });
    expect(
      pick.through.route === "addresses" && pick.through.address.components,
    ).toMatchObject({ line1: "45 Ferry Landing", postal_code: "16507" });
  });
});
