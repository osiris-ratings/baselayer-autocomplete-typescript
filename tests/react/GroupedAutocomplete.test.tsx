import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  DEFAULT_PICKABLE,
  createAutocompleteClient,
  type BusinessPick,
  type EntityPick,
  type EntityType,
  type FetchLike,
  type MintFunction,
  type PersonRowLayoutInput,
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

const business = (
  label: string,
  token: string | null,
  role: string,
  address: string | null = null,
  states: string[] = ["DE"],
) => ({
  type: "business",
  token,
  label,
  role,
  matched: false,
  address,
  states,
  domicile_state: states[states.length - 1],
});

const entity = (
  type: "person" | "address",
  label: string,
  token: string | null,
  role: string,
) => ({
  type,
  token,
  label,
  role,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const PEOPLE = {
  query: "dana",
  found: 2,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    addresses: { status: "ok" },
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
              "1200 Tallowmere Rd, Wilmington, DE 19801",
              // Sorted by code, as the wire sends them; the domicile is PA.
              ["DE", "FL", "PA"],
            ),
            business("Unsealed Holdings LLC", null, "officer"),
            business("Cobalt Tile Supply LLC", "tok-b-cobalt", "agent"),
          ],
        },
        addresses: {
          count: 3,
          matched: null,
          truncated: false,
          items: [
            entity(
              "address",
              "12 Fernhallow Ln, Dover, DE 19901",
              "tok-a-oak",
              "officer",
            ),
            entity("address", "9 Ashcombe Ct, Dover, DE 19904", null, "agent"),
          ],
        },
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
        addresses: { count: 0, matched: null, truncated: false, items: [] },
      },
    },
  ],
};

const ADDRESSES = {
  query: "45 corvel",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: {
    businesses: { status: "ok" },
    people: { status: "ok" },
  },
  suggestions: [
    {
      type: "address",
      token: "tok-a-corvel",
      label: "45 Corvel Landing Ste 200, Erie, PA 16507",
      matched_name: null,
      match: "strong",
      highlight: [
        { text: "45 Corvel", matched: true },
        { text: " Landing Ste 200, Erie, PA 16507", matched: false },
      ],
      components: {
        line1: "45 Corvel Landing",
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
        people: {
          count: 2,
          matched: null,
          truncated: false,
          items: [
            entity("person", "Wesley Crane", "tok-p-wesley", "officer"),
            entity("person", "Ada Fox", "tok-p-ada", "agent"),
          ],
        },
      },
    },
  ],
};

/** The answer with only the relations asked for, as the service sends it. */
function answer(body: typeof PEOPLE | typeof ADDRESSES, include: string[]) {
  const unasked = { count: null, matched: null, truncated: false, items: [] };
  return {
    ...body,
    sources: Object.fromEntries(
      Object.keys(body.sources).map(relation => [
        relation,
        { status: include.includes(relation) ? "ok" : "not_requested" },
      ]),
    ),
    suggestions: body.suggestions.map(row => ({
      ...row,
      related: Object.fromEntries(
        Object.entries(row.related).map(([relation, set]) => [
          relation,
          include.includes(relation) ? set : unasked,
        ]),
      ),
    })),
  };
}

function setup(scope: SessionScope = SCOPE) {
  const fetch = vi.fn<FetchLike>(async url => {
    const include = (
      new URL(url).searchParams.get("include") ?? "businesses"
    ).split(",");
    return reply(
      200,
      answer(
        url.includes("/autocomplete/people") ? PEOPLE : ADDRESSES,
        include,
      ),
    );
  });
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

type Client = ReturnType<typeof setup>["client"];

function PersonHost({
  client,
  onPick = () => {},
  onPickEntity = () => {},
  include,
  pickable,
  layout,
  showSelection,
}: {
  client: Client;
  onPick?: (pick: BusinessPick) => void;
  onPickEntity?: (pick: EntityPick) => void;
  include?: ("businesses" | "addresses")[];
  pickable?: EntityType[];
  layout?: PersonRowLayoutInput;
  showSelection?: boolean;
}) {
  const [value, setValue] = useState("");
  return (
    <>
      <button type="button" onClick={() => setValue("")}>
        Start over
      </button>
      <button type="button" onClick={() => setValue("Dana Whitfield")}>
        Put back
      </button>
      <button type="button" onClick={() => setValue("dana")}>
        Back to what was typed
      </button>
      <PersonAutocomplete
        client={client}
        id="person"
        label="Person"
        value={value}
        debounceMs={0}
        onChange={setValue}
        onPick={onPick}
        onPickEntity={onPickEntity}
        {...(include !== undefined ? { include } : {})}
        pickable={pickable ?? DEFAULT_PICKABLE}
        {...(layout !== undefined ? { layout } : {})}
        {...(showSelection !== undefined ? { showSelection } : {})}
      />
    </>
  );
}

function AddressHost({
  client,
  onPick = () => {},
  onPickEntity = () => {},
  include,
  pickable,
}: {
  client: Client;
  onPick?: (pick: BusinessPick) => void;
  onPickEntity?: (pick: EntityPick) => void;
  include?: ("businesses" | "people")[];
  pickable?: EntityType[];
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
      onPickEntity={onPickEntity}
      {...(include !== undefined ? { include } : {})}
      pickable={pickable ?? DEFAULT_PICKABLE}
    />
  );
}

/** The lines of a group, by kind, each as its text. */
function linesOf(group: HTMLElement, line: string): string[] {
  return within(group)
    .queryAllByTestId(`${line}-line`)
    .map(element => element.textContent ?? "");
}

async function typeDana(client: Client, props = {}) {
  const user = userEvent.setup();
  render(<PersonHost client={client} {...props} />);
  await user.type(screen.getByRole("combobox"), "dana");
  return {
    user,
    dana: await screen.findByRole("group", { name: "Dana Whitfield" }),
  };
}

describe("PersonAutocomplete", () => {
  it("asks the people route for each person's businesses, and their addresses for the head", async () => {
    const { client, fetch } = setup();
    await typeDana(client);

    const url = new URL(fetch.mock.calls.at(-1)![0]);
    expect(url.pathname).toBe("/autocomplete/people");
    expect(url.searchParams.get("include")).toBe("businesses,addresses");
  });

  it("draws the head: the name, the first address with how many more, and every count", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client);

    const head = within(dana).getByTestId("group-head");
    expect(within(head).getByTestId("grouped-firstAddress")).toHaveTextContent(
      "12 Fernhallow Ln, Dover, DE 19901 +2",
    );
    expect(within(head).getByTestId("grouped-counts")).toHaveTextContent(
      "9 businesses · 3 addresses",
    );
    expect(
      within(dana)
        .getAllByTestId("person-suggestion-match")
        .map(m => m.textContent),
    ).toEqual(["Dana"]);
    const danae = screen.getByRole("group", { name: "Danae Ortega" });
    expect(within(danae).getByTestId("grouped-counts")).toHaveTextContent(
      "1 business · 0 addresses",
    );
    expect(within(danae).queryByTestId("grouped-firstAddress")).toBeNull();
    expect(screen.getByText("2 people")).toBeInTheDocument();
  });

  it("draws a line per business, with its address, its states domicile first, and the role", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client);

    const [harbor] = within(dana).getAllByTestId("business-line");
    expect(within(harbor!).getByTestId("grouped-address")).toHaveTextContent(
      "1200 Tallowmere Rd, Wilmington, DE 19801",
    );
    expect(
      within(harbor!)
        .getAllByTestId("business-suggestion-state")
        .map(state => state.textContent),
    ).toEqual(["PA", "DE", "FL"]);
    expect(within(harbor!).getByTestId("grouped-role")).toHaveTextContent(
      "officer",
    );
    // Every business is drawn; the one the service could not seal is inert.
    expect(linesOf(dana, "business")).toEqual([
      expect.stringContaining("Harbor Concrete Pumping Co., Inc."),
      expect.stringContaining("Unsealed Holdings LLC"),
      expect.stringContaining("Cobalt Tile Supply LLC"),
    ]);
    expect(
      within(dana)
        .getAllByRole("option")
        .map(option => option.textContent),
    ).toEqual([
      expect.stringContaining("Harbor Concrete Pumping Co., Inc."),
      expect.stringContaining("Cobalt Tile Supply LLC"),
    ]);
    expect(within(dana).getByText("+6 more not shown")).toBeInTheDocument();
    // Addresses are counted, but not listed unless asked.
    expect(linesOf(dana, "address")).toEqual([]);
  });

  it("describes each group by what only its inert lines say, for a screen reader", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      include: ["businesses", "addresses"],
    });

    // The options speak for themselves; a screen reader in a listbox moves
    // from option to option, so the rest is the group's description: the
    // head's first address and counts, each line that is not a pick, and
    // what each list leaves out.
    const description = [
      "12 Fernhallow Ln, Dover, DE 19901 +2",
      "9 businesses · 3 addresses",
      "Unsealed Holdings LLC",
      "+6 more not shown",
      "12 Fernhallow Ln, Dover, DE 19901",
      "9 Ashcombe Ct, Dover, DE 19904",
      "+1 more not shown",
    ];
    const described = (dana.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map(id => document.getElementById(id)?.textContent ?? "");
    expect(described).toEqual([
      description[0],
      description[1],
      expect.stringMatching(/^Unsealed Holdings LLC.*officer$/),
      description[3],
      expect.stringMatching(/^12 Fernhallow Ln, Dover, DE 19901.*officer$/),
      expect.stringMatching(/^9 Ashcombe Ct, Dover, DE 19904.*agent$/),
      description[6],
    ]);
    expect(
      screen.getByRole("group", { name: "Danae Ortega" }),
    ).toHaveAccessibleDescription("1 business · 0 addresses");
  });

  it("gives a line that is not a pick no role in the listbox", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      include: ["businesses", "addresses"],
    });

    const inert = [
      within(dana).getByTestId("group-head"),
      within(dana).getAllByTestId("business-line")[1]!,
      ...within(dana).getAllByTestId("address-line"),
    ];
    for (const line of inert) {
      expect(line).toHaveAttribute("role", "presentation");
    }
    expect(within(dana).getAllByTestId("business-line")[0]).toHaveAttribute(
      "role",
      "option",
    );
  });

  it("lists a person's addresses when the host includes them, each with the person's role there", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      include: ["businesses", "addresses"],
    });

    expect(linesOf(dana, "address")).toEqual([
      "12 Fernhallow Ln, Dover, DE 19901officer",
      "9 Ashcombe Ct, Dover, DE 19904agent",
    ]);
    expect(within(dana).getByText("+1 more not shown")).toBeInTheDocument();
    // Listed, not pickable: no address is an option.
    expect(
      within(dana).queryByRole("option", { name: /12 Fernhallow Ln/ }),
    ).toBeNull();
  });

  it("moves through the pickable lines only, and picks a business with the person it came through", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });

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
    const { user } = await typeDana(client, { onPick });

    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    expect(onPick.mock.calls[0]![0]).toMatchObject({
      businessToken: "tok-b-cobalt",
      through: { route: "people", role: "agent" },
    });
  });

  it("highlights a pickable line under the pointer, and leaves an inert one be", async () => {
    const { client } = setup();
    const { user, dana } = await typeDana(client);
    const [, unsealed, cobalt] = within(dana).getAllByTestId("business-line");

    await user.hover(unsealed!);
    expect(unsealed).not.toHaveAttribute("data-highlighted");
    expect(unsealed).not.toHaveAttribute("data-pickable");

    await user.hover(cobalt!);
    expect(cobalt).toHaveAttribute("data-highlighted", "true");
    expect(cobalt).toHaveAttribute("data-pickable", "true");
  });

  it("picks the person, or an address listed under them, as a typed pick when they are pickable", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const { user, dana } = await typeDana(client, {
      onPick,
      onPickEntity,
      include: ["businesses", "addresses"],
      pickable: ["person", "address"],
    });

    // The head, then the one address with a token; businesses are inert.
    expect(
      within(dana)
        .getAllByRole("option")
        .map(option => option.dataset.testid),
    ).toEqual(["group-head", "address-line"]);

    await user.keyboard("{ArrowDown}{Enter}");
    await user.click(screen.getByRole("combobox"));
    // The head names the first address too; the address's own line is the pick.
    const [oak] = await screen.findAllByTestId("address-line");
    await user.click(oak!);

    expect(onPickEntity.mock.calls.map(([pick]) => pick)).toEqual([
      { type: "person", token: "tok-p-dana", label: "Dana Whitfield" },
      {
        type: "address",
        token: "tok-a-oak",
        label: "12 Fernhallow Ln, Dover, DE 19901",
      },
    ]);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("draws the fields where the layout puts them, and asks only for what it draws", async () => {
    const { client, fetch } = setup();
    const { dana } = await typeDana(client, {
      layout: {
        headBadge: null,
        headTrailing: null,
        businessTrailingBadge: null,
      },
    });

    expect(
      new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("include"),
    ).toBe("businesses");
    expect(within(dana).queryByTestId("grouped-counts")).toBeNull();
    expect(within(dana).queryByTestId("grouped-firstAddress")).toBeNull();
    expect(within(dana).queryAllByTestId("business-suggestion-state")).toEqual(
      [],
    );
    expect(within(dana).getAllByTestId("grouped-role")).toHaveLength(3);
  });

  it("drops what the session's scope leaves out, instead of failing the search", async () => {
    const { client, fetch } = setup({
      routes: { businesses: ["people", "addresses"], people: ["businesses"] },
      maxLimit: 20,
    });
    const { dana } = await typeDana(client, {
      include: ["businesses", "addresses"],
    });

    expect(
      new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("include"),
    ).toBe("businesses");
    expect(within(dana).getByTestId("grouped-counts")).toHaveTextContent(
      /^9 businesses$/,
    );
    expect(within(dana).queryByTestId("grouped-firstAddress")).toBeNull();
    expect(linesOf(dana, "address")).toEqual([]);
    expect(within(dana).getAllByRole("option")).toHaveLength(2);
  });

  it("says the search is out of reach when the session's scope leaves people out", async () => {
    const { client, fetch } = setup({
      routes: { businesses: ["people", "addresses"] },
      maxLimit: 20,
    });
    const user = userEvent.setup();
    render(<PersonHost client={client} />);

    await user.type(screen.getByRole("combobox"), "dana");
    await aMoment();

    expect(
      await screen.findByText(DEFAULT_MESSAGES.outOfScope),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("needs somewhere to send a person or an address picked", () => {
    const client = setup().client;
    const props = {
      client,
      id: "person",
      value: "",
      onChange: () => {},
      onPick: () => {},
    };

    // @ts-expect-error: a person to pick needs onPickEntity.
    const bare = <PersonAutocomplete {...props} pickable={["person"]} />;
    const businessesOnly = (
      <PersonAutocomplete {...props} pickable={["business"]} />
    );

    expect([bare, businessesOnly]).toHaveLength(2);
  });
});

describe("AddressAutocomplete", () => {
  it("draws each address with every count, and its businesses with how each holds it", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} />);

    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", {
      name: "45 Corvel Landing Ste 200, Erie, PA 16507",
    });

    const url = new URL(fetch.mock.calls.at(-1)![0]);
    expect(url.pathname).toBe("/autocomplete/addresses");
    expect(url.searchParams.get("include")).toBe("businesses,people");
    expect(within(corvel).getByTestId("grouped-counts")).toHaveTextContent(
      "412 businesses · 2 people",
    );
    const options = within(corvel).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Ridgeline Freight LLC");
    expect(options[0]).toHaveTextContent("principal office");
    expect(options[1]).toHaveTextContent("registered agent");
    expect(within(corvel).getByText("+410 more not shown")).toBeInTheDocument();
    expect(linesOf(corvel, "person")).toEqual([]);
    expect(screen.getByText("1 address")).toBeInTheDocument();
  });

  it("lists the people at an address when the host includes them, each with their role", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} include={["businesses", "people"]} />);

    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", { name: /45 Corvel/ });

    expect(linesOf(corvel, "person")).toEqual([
      "Wesley Craneofficer",
      "Ada Foxagent",
    ]);
  });

  it("picks a business with the address it came through", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const user = userEvent.setup();
    render(<AddressHost client={client} onPick={onPick} />);

    await user.type(screen.getByRole("combobox"), "45 corvel");
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
    ).toMatchObject({ line1: "45 Corvel Landing", postal_code: "16507" });
  });

  it("picks the address itself, or a person at it, when they are pickable", async () => {
    const { client } = setup();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const user = userEvent.setup();
    render(
      <AddressHost
        client={client}
        onPickEntity={onPickEntity}
        include={["businesses", "people"]}
        pickable={["address", "person", "business"]}
      />,
    );

    await user.type(screen.getByRole("combobox"), "45 corvel");
    await user.click(await screen.findByRole("option", { name: /Ada Fox/ }));

    expect(onPickEntity).toHaveBeenCalledWith({
      type: "person",
      token: "tok-p-ada",
      label: "Ada Fox",
    });
  });
});

describe("the selection line", () => {
  const selection = () => screen.queryByTestId("grouped-selection");
  const input = () => screen.getByRole<HTMLInputElement>("combobox");

  it("puts the person's name in the field, not what was typed, and names the business picked under it", async () => {
    const { client } = setup();
    const { user } = await typeDana(client);

    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toHaveTextContent("Cobalt Tile Supply LLC");
    expect(input()).toHaveAccessibleDescription("Cobalt Tile Supply LLC");
  });

  it("names the address picked, or the person, when they are what was picked", async () => {
    const { client } = setup();
    const { user } = await typeDana(client, {
      include: ["businesses", "addresses"],
      pickable: ["person", "address"],
    });

    const [oak] = screen.getAllByTestId("address-line");
    await user.click(oak!);
    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toHaveTextContent("12 Fernhallow Ln, Dover, DE 19901");
    expect(selection()).toHaveAttribute("data-type", "address");

    await user.clear(input());
    await user.type(input(), "danae");
    await user.click(
      await screen.findByRole("option", { name: /^Danae Ortega/ }),
    );
    expect(input().value).toBe("Danae Ortega");
    expect(selection()).toHaveTextContent("Danae Ortega");
    expect(selection()).toHaveAttribute("data-type", "person");
  });

  it("goes with any edit, and stays gone when the edit is undone", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.type(input(), "x");
    expect(selection()).toBeNull();
    expect(input()).not.toHaveAccessibleDescription();

    // Back to the very name the pick put there: still no pick.
    await user.type(input(), "{Backspace}");
    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toBeNull();
  });

  it("goes when the host empties the field", async () => {
    const { client } = setup();
    const { user } = await typeDana(client);
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.click(screen.getByRole("button", { name: "Start over" }));

    expect(input().value).toBe("");
    expect(selection()).toBeNull();
  });

  /** A host that takes the picked name late, or never, and typing at once. */
  function LateHost({
    client,
    takesPick,
  }: {
    client: Client;
    takesPick: "later" | "never";
  }) {
    const [value, setValue] = useState("");
    // Only the pick's name is the host's to take late, or to drop; a name
    // typed later is typing.
    const [picks, setPicks] = useState(0);
    return (
      <PersonAutocomplete
        client={client}
        id="person"
        label="Person"
        value={value}
        debounceMs={0}
        onChange={next => {
          if (next !== "Dana Whitfield" || picks > 0) {
            setValue(next);
          } else if (takesPick === "later") {
            setTimeout(() => setValue(next), 20);
          }
        }}
        onPick={() => setPicks(count => count + 1)}
      />
    );
  }

  it("waits for a host that puts the picked name in the field a render later", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<LateHost client={client} takesPick="later" />);
    await user.type(input(), "dana");

    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );
    // Still what was typed: the pick is kept for the name to come.
    expect(input().value).toBe("dana");
    await aMoment();

    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toHaveTextContent("Cobalt Tile Supply LLC");
  });

  it("lets a pick go that the field never took, once the field is edited", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<LateHost client={client} takesPick="never" />);
    await user.type(input(), "dana");
    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.type(input(), " ");
    await user.clear(input());
    // Typed by hand, the name is not the pick.
    await user.type(input(), "Dana Whitfield");

    expect(selection()).toBeNull();
  });

  it("stays gone when the host puts the picked name back", async () => {
    const { client } = setup();
    const { user } = await typeDana(client);
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.click(screen.getByRole("button", { name: "Start over" }));
    await user.click(screen.getByRole("button", { name: "Put back" }));

    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toBeNull();
  });

  it("stays gone when the host puts back what was typed, and then the name", async () => {
    const { client } = setup();
    const { user } = await typeDana(client);
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.click(
      screen.getByRole("button", { name: "Back to what was typed" }),
    );
    await user.click(screen.getByRole("button", { name: "Put back" }));

    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toBeNull();
  });

  it("comes back when the same business is picked again after an edit", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.clear(input());
    await user.type(input(), "dana");
    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    expect(onPick).toHaveBeenCalledTimes(2);
    expect(selection()).toHaveTextContent("Cobalt Tile Supply LLC");
  });

  it("is left to the host with showSelection off, and the field still takes the name", async () => {
    const { client } = setup();
    const { user } = await typeDana(client, { showSelection: false });

    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    expect(input().value).toBe("Dana Whitfield");
    expect(selection()).toBeNull();
  });

  it("puts the address in an address field, and names the business or the person picked at it", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(
      <AddressHost
        client={client}
        include={["businesses", "people"]}
        pickable={["business", "person"]}
      />,
    );

    await user.type(input(), "45 corvel");
    await user.click(
      await screen.findByRole("option", { name: /Ridgeline Freight LLC/ }),
    );
    expect(input().value).toBe("45 Corvel Landing Ste 200, Erie, PA 16507");
    expect(selection()).toHaveTextContent("Ridgeline Freight LLC");

    await user.clear(input());
    await user.type(input(), "45 corvel");
    await user.click(await screen.findByRole("option", { name: /Ada Fox/ }));
    expect(selection()).toHaveTextContent("Ada Fox");
    expect(selection()).toHaveAttribute("data-type", "person");
  });
});
