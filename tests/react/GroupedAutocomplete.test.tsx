import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  DEFAULT_ENABLED_LINES,
  DEFAULT_LOOK,
  createAutocompleteClient,
  parseSuggestResponse,
  type AddressesFilters,
  type BusinessPick,
  type EntityPick,
  type EntityType,
  type FetchLike,
  type MintFunction,
  type MintOutcome,
  type PeopleFilters,
  type PersonIconSegment,
  type PersonRowLayoutInput,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import {
  AddressAutocomplete,
  AddressAutocompleteView,
  DEFAULT_MESSAGES,
  PersonAutocomplete,
  PersonAutocompleteView,
  useEntityAutocomplete,
  type IconSet,
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

/** A business listed under a person or an address: it always has a token. */
const business = (
  label: string,
  token: string,
  address: string | null = null,
  states: string[] = ["DE"],
) => ({
  type: "business",
  token,
  label,
  matched: false,
  matched_name: null,
  highlight: null,
  address,
  states,
  domicile_state: states[states.length - 1],
});

/** A business under a person, with the role they hold on it. */
const heldBusiness = (role: string, ...args: Parameters<typeof business>) => ({
  ...business(...args),
  role,
});

/** A business under an address, with how it filed there. */
const filedBusiness = (
  listed_as: string,
  ...args: Parameters<typeof business>
) => ({ ...business(...args), listed_as });

/** A person or an address listed under a row: no token, no role of its own. */
const listed = (type: "person" | "address", label: string) => ({
  type,
  label,
  matched: false,
  highlight: null,
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
      match: "strong",
      highlight: [
        { text: "Dana", matched: true },
        { text: " Whitfield", matched: false },
      ],
      states: ["DE", "FL", "PA"],
      related: {
        businesses: {
          count: 9,
          matched: null,
          truncated: true,
          items: [
            heldBusiness(
              "officer",
              "Harbor Concrete Pumping Co., Inc.",
              "tok-b-harbor",
              "1200 Tallowmere Rd, Wilmington, DE 19801",
              // Sorted by code, as the wire sends them; the domicile is PA.
              ["DE", "FL", "PA"],
            ),
            // The filing names no role, so the item has no `role` at all.
            business("Quillon Salvage LLC", "tok-b-quillon"),
            heldBusiness("agent", "Cobalt Tile Supply LLC", "tok-b-cobalt"),
          ],
        },
        addresses: {
          count: 3,
          matched: null,
          truncated: false,
          items: [
            listed("address", "12 Fernhallow Ln, Dover, DE 19901"),
            listed("address", "9 Ashcombe Ct, Dover, DE 19904"),
          ],
        },
      },
    },
    {
      type: "person",
      token: "tok-p-danae",
      label: "Danae Ortega",
      match: "strong",
      highlight: [{ text: "Danae", matched: true }],
      states: ["DE"],
      related: {
        businesses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            heldBusiness("officer", "Ortega Masonry LLC", "tok-b-ortega"),
          ],
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
            filedBusiness(
              "principal",
              "Ridgeline Freight LLC",
              "tok-b-ridgeline",
            ),
            filedBusiness(
              "registered_office",
              "Cinder Rigging, Inc.",
              "tok-b-cinder",
            ),
          ],
        },
        people: {
          count: 2,
          matched: null,
          truncated: false,
          items: [
            listed("person", "Wesley Crane"),
            listed("person", "Ada Fox"),
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

/** A mint that grants `scope`. */
const grant = (scope: SessionScope): MintOutcome => ({
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

function setup(
  scope: SessionScope = SCOPE,
  mint: MintFunction = async () => grant(scope),
) {
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
  list,
  enabledLines,
  layout,
  showSelection,
  icons,
  iconSegments,
  filters,
}: {
  client: Client;
  onPick?: (pick: BusinessPick) => void;
  onPickEntity?: (pick: EntityPick) => void;
  list?: ("businesses" | "addresses")[];
  enabledLines?: EntityType[];
  layout?: PersonRowLayoutInput;
  showSelection?: boolean;
  icons?: IconSet;
  iconSegments?: PersonIconSegment[];
  filters?: PeopleFilters;
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
        {...(list !== undefined ? { list } : {})}
        enabledLines={enabledLines ?? DEFAULT_ENABLED_LINES}
        {...(layout !== undefined ? { layout } : {})}
        {...(showSelection !== undefined ? { showSelection } : {})}
        {...(icons !== undefined ? { icons } : {})}
        {...(iconSegments !== undefined ? { iconSegments } : {})}
        {...(filters !== undefined ? { filters } : {})}
      />
    </>
  );
}

function AddressHost({
  client,
  onPick = () => {},
  onPickEntity = () => {},
  list,
  enabledLines,
  filters,
}: {
  client: Client;
  onPick?: (pick: BusinessPick) => void;
  onPickEntity?: (pick: EntityPick) => void;
  list?: ("businesses" | "people")[];
  enabledLines?: EntityType[];
  filters?: AddressesFilters;
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
      {...(list !== undefined ? { list } : {})}
      enabledLines={enabledLines ?? DEFAULT_ENABLED_LINES}
      {...(filters !== undefined ? { filters } : {})}
    />
  );
}

/** The options in `element` a pick can land on: those not disabled. */
function enabledOptions(element: HTMLElement): HTMLElement[] {
  return within(element)
    .queryAllByRole("option")
    .filter(option => option.getAttribute("aria-disabled") !== "true");
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
    // Every business is drawn and is a pick, each carrying its token; the role
    // is drawn where the filing names one.
    expect(linesOf(dana, "business")).toEqual([
      expect.stringContaining("Harbor Concrete Pumping Co., Inc."),
      expect.stringContaining("Quillon Salvage LLC"),
      expect.stringContaining("Cobalt Tile Supply LLC"),
    ]);
    expect(
      within(dana)
        .getAllByTestId("business-line")
        .map(line => within(line).queryByTestId("grouped-role")?.textContent),
    ).toEqual(["officer", undefined, "agent"]);
    expect(enabledOptions(dana).map(option => option.textContent)).toEqual([
      expect.stringContaining("Harbor Concrete Pumping Co., Inc."),
      expect.stringContaining("Quillon Salvage LLC"),
      expect.stringContaining("Cobalt Tile Supply LLC"),
    ]);
    expect(within(dana).getByText("+6 more not shown")).toBeInTheDocument();
    // Addresses are counted, but not listed unless asked.
    expect(linesOf(dana, "address")).toEqual([]);
  });

  it("describes each group by its head's first address, its counts and what each list leaves out", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });

    // Every line is an option, enabled or not, and speaks for itself; the
    // group's description is what no option says.
    const described = (dana.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map(id => document.getElementById(id)?.textContent ?? "");
    expect(described).toEqual([
      "12 Fernhallow Ln, Dover, DE 19901 +2",
      "9 businesses · 3 addresses",
      "+6 more not shown",
      "+1 more not shown",
    ]);
    expect(
      screen.getByRole("group", { name: "Danae Ortega" }),
    ).toHaveAccessibleDescription("1 business · 0 addresses");
  });

  it("makes a line or a head that is not a pick a disabled option, the head still the group's label", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });

    // Not a pick by default: a person's head is a disabled option, and still
    // what the group is named by.
    const head = within(dana).getByTestId("group-head");
    expect(head).toHaveAttribute("role", "option");
    expect(head).toHaveAttribute("aria-disabled", "true");
    expect(dana).toHaveAccessibleName("Dana Whitfield");
    // An address is not a pick by default either, token or no.
    for (const line of within(dana).getAllByTestId("address-line")) {
      expect(line).toHaveAttribute("role", "option");
      expect(line).toHaveAttribute("aria-disabled", "true");
    }
    for (const line of within(dana).getAllByTestId("business-line")) {
      expect(line).toHaveAttribute("role", "option");
      expect(line).not.toHaveAttribute("aria-disabled", "true");
    }
    // Named by its text, so a screen reader says what it is, and unavailable.
    expect(
      within(dana).getByRole("option", { name: /9 Ashcombe Ct/ }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("picks nothing, and leaves the field as it was, when a disabled line is clicked", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const { user, dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
      onPick,
      onPickEntity,
    });

    await user.click(within(dana).getAllByTestId("address-line")[0]!);
    await user.click(within(dana).getByTestId("group-head"));

    expect(onPick).not.toHaveBeenCalled();
    expect(onPickEntity).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLInputElement>("combobox").value).toBe("dana");
    expect(screen.queryByTestId("grouped-selection")).toBeNull();
  });

  it("lists a person's addresses when the host includes them, with no role: the service sends none there", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });

    expect(linesOf(dana, "address")).toEqual([
      "12 Fernhallow Ln, Dover, DE 19901",
      "9 Ashcombe Ct, Dover, DE 19904",
    ]);
    expect(
      within(dana)
        .getAllByTestId("address-line")
        .flatMap(line => within(line).queryAllByTestId("grouped-role")),
    ).toEqual([]);
    expect(within(dana).getByText("+1 more not shown")).toBeInTheDocument();
    // Listed, not enabled: an address is a disabled option by default.
    const [fernhallow] = within(dana).getAllByTestId("address-line");
    expect(fernhallow).toHaveAttribute("role", "option");
    expect(fernhallow).toHaveAttribute("aria-disabled", "true");
  });

  it("moves through the enabled lines only, and picks a business with the person it came through", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    // The two listed addresses are not picks, so the keys skip them: the
    // head, Dana's three businesses and then Danae's.
    const { user } = await typeDana(client, {
      onPick,
      list: ["addresses", "businesses"],
    });

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");

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

  it("picks a business the filing gives no role as held through no role", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });

    await user.click(
      screen.getByRole("option", { name: /Quillon Salvage LLC/ }),
    );

    expect(onPick.mock.calls[0]![0]).toMatchObject({
      businessToken: "tok-b-quillon",
      through: { route: "people", role: null },
    });
  });

  it("shows a view's rows though none of their lines is a pick and no footer has anything to say", () => {
    render(
      <PersonAutocompleteView
        id="person"
        value="dana"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={PEOPLE.suggestions as never}
        found={2}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        enabledLines={[]}
        open
      />,
    );

    expect(screen.getByTestId("autocomplete-menu")).not.toHaveAttribute(
      "hidden",
    );
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });

  it("draws a person's rows though none of their lines is a pick", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, { enabledLines: [] });

    expect(within(dana).getAllByTestId("business-line")).toHaveLength(3);
    expect(enabledOptions(document.body)).toHaveLength(0);
  });

  it("highlights an enabled line under the pointer, and leaves a disabled one be", async () => {
    const { client } = setup();
    const { user, dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });
    const [fernhallow] = within(dana).getAllByTestId("address-line");
    const [, , cobalt] = within(dana).getAllByTestId("business-line");

    await user.hover(fernhallow!);
    expect(fernhallow).not.toHaveAttribute("data-highlighted");
    expect(fernhallow).not.toHaveAttribute("data-enabled");

    await user.hover(cobalt!);
    expect(cobalt).toHaveAttribute("data-highlighted", "true");
    expect(cobalt).toHaveAttribute("data-enabled", "true");
  });

  it("picks the person, or an address listed under them, as a typed pick when they are enabled", async () => {
    const { client } = setup();
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const { user, dana } = await typeDana(client, {
      onPick,
      onPickEntity,
      list: ["businesses", "addresses"],
      enabledLines: ["person", "address"],
    });

    // The head, then both addresses: a listed address needs no token of its
    // own to be a pick. Businesses are disabled.
    expect(enabledOptions(dana).map(option => option.dataset.testid)).toEqual([
      "group-head",
      "address-line",
      "address-line",
    ]);

    await user.keyboard("{ArrowDown}{Enter}");
    // The pick holds the search for the name it put in the field; typing
    // brings the rows back.
    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "dana");
    // The head names the first address too; the address's own line is the pick.
    const [fernhallow] = await screen.findAllByTestId("address-line");
    await user.click(fernhallow!);
    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "dana");
    await user.click((await screen.findAllByTestId("address-line"))[1]!);

    // The row's head hands the row's own token; an address listed under it
    // has none, for the service seals none for it.
    expect(onPickEntity.mock.calls.map(([pick]) => pick)).toEqual([
      { type: "person", token: "tok-p-dana", label: "Dana Whitfield" },
      {
        type: "address",
        token: null,
        label: "12 Fernhallow Ln, Dover, DE 19901",
      },
      {
        type: "address",
        token: null,
        label: "9 Ashcombe Ct, Dover, DE 19904",
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
    // Only the two businesses whose filing names a role draw one.
    expect(within(dana).getAllByTestId("grouped-role")).toHaveLength(2);
  });

  it("drops what the session's scope leaves out, instead of failing the search", async () => {
    const { client, fetch } = setup({
      routes: { businesses: ["people", "addresses"], people: ["businesses"] },
      maxLimit: 20,
    });
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });

    expect(
      new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("include"),
    ).toBe("businesses");
    expect(within(dana).getByTestId("grouped-counts")).toHaveTextContent(
      /^9 businesses$/,
    );
    expect(within(dana).queryByTestId("grouped-firstAddress")).toBeNull();
    expect(linesOf(dana, "address")).toEqual([]);
    expect(enabledOptions(dana)).toHaveLength(3);
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
    const bare = <PersonAutocomplete {...props} enabledLines={["person"]} />;
    const businessesOnly = (
      <PersonAutocomplete {...props} enabledLines={["business"]} />
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
    const options = enabledOptions(corvel);
    expect(options[0]).toHaveTextContent("Ridgeline Freight LLC");
    expect(options[0]).toHaveTextContent("principal office");
    expect(options[1]).toHaveTextContent(/agent$/);
    expect(within(corvel).getByText("+410 more not shown")).toBeInTheDocument();
    expect(linesOf(corvel, "person")).toEqual([]);
    expect(screen.getByText("1 address")).toBeInTheDocument();
  });

  it("lists the people at an address when the host includes them, with no role: the service sends none there", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} list={["businesses", "people"]} />);

    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", { name: /45 Corvel/ });

    expect(linesOf(corvel, "person")).toEqual(["Wesley Crane", "Ada Fox"]);
    expect(within(corvel).queryAllByTestId("grouped-role")).toHaveLength(2);
    expect(
      within(corvel)
        .getAllByTestId("person-line")
        .flatMap(line => within(line).queryAllByTestId("grouped-role")),
    ).toEqual([]);
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
      through: { route: "addresses", listedAs: "principal" },
    });
    expect(
      pick.through.route === "addresses" && pick.through.address.components,
    ).toMatchObject({ line1: "45 Corvel Landing", postal_code: "16507" });
  });

  it("picks the address itself, or a person at it, when they are enabled", async () => {
    const { client } = setup();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const user = userEvent.setup();
    render(
      <AddressHost
        client={client}
        onPickEntity={onPickEntity}
        list={["businesses", "people"]}
        enabledLines={["address", "person", "business"]}
      />,
    );

    await user.type(screen.getByRole("combobox"), "45 corvel");
    await user.click(await screen.findByRole("option", { name: /Ada Fox/ }));
    await user.clear(screen.getByRole("combobox"));
    await user.type(screen.getByRole("combobox"), "45 corvel");
    await user.click(await screen.findByTestId("group-head"));

    // A person listed under the address has no token; the address's head hands
    // its own.
    expect(onPickEntity.mock.calls.map(([pick]) => pick)).toEqual([
      { type: "person", token: null, label: "Ada Fox" },
      {
        type: "address",
        token: "tok-a-corvel",
        label: "45 Corvel Landing Ste 200, Erie, PA 16507",
      },
    ]);
  });
});

// The roles are an open enum: the service may send one this build does not
// list. Its line draws the value as sent, and a pick keeps it, rather than the
// line going blank or the answer being refused.
describe("a role this build does not know", () => {
  const view = {
    onInputChange: () => {},
    onSelect: () => {},
    found: 1,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    open: true,
  };

  /** `PEOPLE` with Dana's first and last business held in the roles given. */
  function role(first: string, last: string) {
    const copy = structuredClone(PEOPLE);
    const [harbor, , cobalt] = copy.suggestions[0]!.related.businesses.items;
    Object.assign(harbor!, { role: first });
    Object.assign(cobalt!, { role: last });
    return copy;
  }

  /** `ADDRESSES` with the first and last business filed in the ways given. */
  function listedAs(first: string, last: string) {
    const copy = structuredClone(ADDRESSES);
    const [ridgeline, cinder] = copy.suggestions[0]!.related.businesses.items;
    Object.assign(ridgeline!, { listed_as: first });
    Object.assign(cinder!, { listed_as: last });
    return copy;
  }

  const roles = (lines: HTMLElement[]) =>
    lines.map(line => within(line).queryByTestId("grouped-role")?.textContent);

  it("draws a person's role on a business as sent, beside the ones it knows", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={
          parseSuggestResponse("people", role("director", "agent")).suggestions
        }
      />,
    );

    expect(roles(screen.getAllByTestId("business-line"))).toEqual([
      "director",
      undefined,
      "agent",
      "officer",
    ]);
  });

  it("draws how a business filed an address as sent, beside the ones it knows", () => {
    render(
      <AddressAutocompleteView
        {...view}
        id="address"
        value="45 corvel"
        suggestions={
          parseSuggestResponse(
            "addresses",
            listedAs("head_office", "registered_office"),
          ).suggestions
        }
      />,
    );

    expect(roles(screen.getAllByTestId("business-line"))).toEqual([
      "head_office",
      "agent",
    ]);
  });

  it("draws the host's own words for the roles it names, and the value as sent for the rest", () => {
    render(
      <AddressAutocompleteView
        {...view}
        id="address"
        value="45 corvel"
        messages={{
          addressRoles: {
            ...DEFAULT_MESSAGES.addressRoles,
            registered_office: "registered agent's office",
          },
        }}
        suggestions={
          parseSuggestResponse(
            "addresses",
            listedAs("head_office", "registered_office"),
          ).suggestions
        }
      />,
    );

    expect(roles(screen.getAllByTestId("business-line"))).toEqual([
      "head_office",
      "registered agent's office",
    ]);
  });

  it("keeps it on the pick, as the service sent it", async () => {
    const fetch = vi.fn<FetchLike>(async url =>
      reply(
        200,
        answer(
          role("director", "agent"),
          (new URL(url).searchParams.get("include") ?? "businesses").split(","),
        ),
      ),
    );
    const client = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint: async () => grant(SCOPE),
      fetch,
    });
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });

    await user.click(
      screen.getByRole("option", { name: /Harbor Concrete Pumping/ }),
    );

    expect(onPick.mock.calls[0]![0]).toMatchObject({
      businessToken: "tok-b-harbor",
      through: { route: "people", role: "director" },
    });
  });
});

// A business a business name filter reached through the other name it goes
// by (a DBA, or a former name) says so on its line, as a business row does:
// `also` and that name, muted, after its own. The service sends no marks for
// it, so it is drawn plain, as the line's own name is.
describe("a business matched on its other name", () => {
  /** `body` with its first row's first business matched on `name`. */
  function matchedOn<T extends typeof PEOPLE | typeof ADDRESSES>(
    body: T,
    name: string,
  ): T {
    const copy = structuredClone(body);
    Object.assign(copy.suggestions[0]!.related.businesses.items[0]!, {
      matched: true,
      matched_name: name,
    });
    return copy;
  }

  const view = {
    onInputChange: () => {},
    onSelect: () => {},
    found: 1,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    open: true,
  };

  it("says it after the business's name under a person, muted and unmarked", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={
          parseSuggestResponse("people", matchedOn(PEOPLE, "Tidewater Pumps"))
            .suggestions
        }
      />,
    );

    const dana = screen.getByRole("group", { name: "Dana Whitfield" });
    const [harbor, quillon, cobalt] =
      within(dana).getAllByTestId("business-line");
    const also = within(harbor!).getByTestId("grouped-also");
    expect(also).toHaveTextContent(/^also Tidewater Pumps$/);
    expect(also).toHaveClass("bl-ac-also");
    expect(also.querySelector(".bl-ac-mark")).toBeNull();
    const name = within(harbor!).getByText("Harbor Concrete Pumping Co., Inc.");
    expect(also.closest('[data-corner="lead"]')).toBe(
      name.closest('[data-corner="lead"]'),
    );
    expect(
      name.compareDocumentPosition(also) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Right after the name, before the badge, which is the business's
    // address by default: the line reads as the row's title does.
    const address = within(harbor!).getByTestId("grouped-address");
    expect(also.nextElementSibling).toBe(address);
    // Only the business that matched on another name says one.
    expect(within(quillon!).queryByTestId("grouped-also")).toBeNull();
    expect(within(cobalt!).queryByTestId("grouped-also")).toBeNull();
  });

  it("says it after the business's name under an address", () => {
    render(
      <AddressAutocompleteView
        {...view}
        id="address"
        value="45 corvel"
        suggestions={
          parseSuggestResponse(
            "addresses",
            matchedOn(ADDRESSES, "Ember Freight"),
          ).suggestions
        }
      />,
    );

    const [ridgeline, cinder] = screen.getAllByTestId("business-line");
    expect(ridgeline).toHaveTextContent(
      /^Ridgeline Freight LLC\s*also Ember Freight/,
    );
    expect(within(cinder!).queryByTestId("grouped-also")).toBeNull();
  });

  it("still picks the business by its own name", async () => {
    const fetch = vi.fn<FetchLike>(async url =>
      reply(
        200,
        answer(
          matchedOn(PEOPLE, "Tidewater Pumps"),
          (new URL(url).searchParams.get("include") ?? "businesses").split(","),
        ),
      ),
    );
    const client = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint: async () => grant(SCOPE),
      fetch,
    });
    const onPick = vi.fn<(pick: BusinessPick) => void>();
    const { user } = await typeDana(client, { onPick });

    await user.click(
      screen.getByRole("option", { name: /Harbor Concrete Pumping/ }),
    );

    expect(onPick.mock.calls[0]![0]).toMatchObject({
      businessToken: "tok-b-harbor",
      businessName: "Harbor Concrete Pumping Co., Inc.",
    });
  });
});

// A related item a filter matched carries the parts of the name it matched
// on. Its line marks them as a row's own name is marked, in the look's
// emphasis, as the service sent them: what was typed is the row's text, not
// the filter that matched the item, so nothing is cut at it.
describe("a related item's highlight", () => {
  const ridgeline = [
    { text: "Ridgeline", matched: true },
    { text: " Freight LLC", matched: false },
  ];

  /** `ADDRESSES` with its first business, and its first person, given parts. */
  function withParts(business: object, person: object = {}) {
    const copy = structuredClone(ADDRESSES);
    const [row] = copy.suggestions;
    Object.assign(row!.related.businesses.items[0]!, {
      matched: true,
      ...business,
    });
    Object.assign(row!.related.people.items[0]!, person);
    return parseSuggestResponse("addresses", copy).suggestions;
  }

  function drawAddresses(
    suggestions: ReturnType<typeof withParts>,
    look: Partial<typeof DEFAULT_LOOK> = {},
    appliedFilters?: AddressesFilters,
  ) {
    render(
      <AddressAutocompleteView
        id="address"
        value="ridge"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={suggestions}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        list={["businesses", "people"]}
        look={{ ...DEFAULT_LOOK, ...look }}
        {...(appliedFilters !== undefined ? { appliedFilters } : {})}
        open
      />,
    );
    return {
      business: screen.getAllByTestId("business-line"),
      person: screen.getAllByTestId("person-line"),
    };
  }

  const marks = (element: Element) =>
    [...element.querySelectorAll(".bl-ac-mark")].map(mark => mark.textContent);

  it("underlines the parts of a business's name under an address, whole as sent", () => {
    const { business } = drawAddresses(withParts({ highlight: ridgeline }));

    const name = business[0]!.querySelector<HTMLElement>(".bl-ac-line-name")!;
    // `ridge` was typed, but the parts are the filter's: not cut at it.
    expect(marks(name)).toEqual(["Ridgeline"]);
    expect(name).toHaveTextContent("Ridgeline Freight LLC");
    expect(name).toHaveAttribute("data-emphasis", "underline");
  });

  it("underlines the other name when the parts spell it, and leaves the label plain", () => {
    const { business } = drawAddresses(
      withParts({
        matched_name: "Ember Freight",
        highlight: [
          { text: "Ember", matched: true },
          { text: " Freight", matched: false },
        ],
      }),
    );

    const name = business[0]!.querySelector<HTMLElement>(".bl-ac-line-name")!;
    const also = within(business[0]!).getByTestId("grouped-also");
    expect(marks(name)).toEqual([]);
    expect(name).not.toHaveAttribute("data-emphasis");
    expect(marks(also)).toEqual(["Ember"]);
    expect(also).toHaveTextContent(/^also Ember Freight$/);
    expect(also).toHaveAttribute("data-emphasis", "underline");
  });

  it("underlines the parts of a person's name under an address", () => {
    const { person } = drawAddresses(
      withParts(
        {},
        {
          matched: true,
          highlight: [
            { text: "Wesley", matched: true },
            { text: " Crane", matched: false },
          ],
        },
      ),
    );

    expect(marks(person[0]!)).toEqual(["Wesley"]);
    expect(marks(person[1]!)).toEqual([]);
  });

  it("underlines the parts of the first address a person's head shows", () => {
    const copy = structuredClone(PEOPLE);
    Object.assign(copy.suggestions[0]!.related.addresses.items[0]!, {
      matched: true,
      highlight: [
        { text: "12 Fernhallow", matched: true },
        { text: " Ln, Dover, DE 19901", matched: false },
      ],
    });
    render(
      <PersonAutocompleteView
        id="person"
        value="fern"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={parseSuggestResponse("people", copy).suggestions}
        found={2}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        open
      />,
    );

    const [first, second] = screen.getAllByTestId("grouped-firstAddress");
    expect(marks(first!)).toEqual(["12 Fernhallow"]);
    expect(first).toHaveAttribute("data-emphasis", "underline");
    expect(second).toBeUndefined();
  });

  // A row's marks are cut at what was typed in its field; a related item's
  // are cut at what was typed in the filter that matched it, under the
  // typed-characters region, and never marked past the service's own.
  it("cuts a related item's parts at its own filter's typed characters", () => {
    const { business, person } = drawAddresses(
      withParts(
        {
          matched_name: "Ember Freight",
          highlight: [
            { text: "Ember", matched: true },
            { text: " Freight", matched: false },
          ],
        },
        {
          matched: true,
          highlight: [
            { text: "Wesley", matched: true },
            { text: " Crane", matched: false },
          ],
        },
      ),
      {},
      { business: { name: "embe" }, person: { name: "wes" } },
    );

    expect(marks(within(business[0]!).getByTestId("grouped-also"))).toEqual([
      "Embe",
    ]);
    expect(marks(person[0]!)).toEqual(["Wes"]);
  });

  it("keeps the service's whole words under the token region", () => {
    const { business } = drawAddresses(
      withParts({ highlight: ridgeline }),
      { matchEmphasisRegion: "token" },
      { business: { name: "ridg" } },
    );

    expect(marks(business[0]!)).toEqual(["Ridgeline"]);
  });

  it("marks no word the service did not, whatever the filter typed", () => {
    const { business } = drawAddresses(
      withParts({ highlight: ridgeline }),
      {},
      { business: { name: "ridgeline freight" } },
    );

    // `Freight` was typed, but the service marked only `Ridgeline`.
    expect(marks(business[0]!)).toEqual(["Ridgeline"]);
  });

  it("cuts a person's first address and their businesses at the person search's filters", () => {
    const copy = structuredClone(PEOPLE);
    const [dana] = copy.suggestions;
    Object.assign(dana!.related.addresses.items[0]!, {
      matched: true,
      highlight: [
        { text: "12 Fernhallow", matched: true },
        { text: " Ln, Dover, DE 19901", matched: false },
      ],
    });
    Object.assign(dana!.related.businesses.items[0]!, {
      matched: true,
      highlight: [
        { text: "Harbor", matched: true },
        { text: " Concrete Pumping Co., Inc.", matched: false },
      ],
    });
    render(
      <PersonAutocompleteView
        id="person"
        value="dana"
        onInputChange={() => {}}
        onSelect={() => {}}
        suggestions={parseSuggestResponse("people", copy).suggestions}
        found={2}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
        appliedFilters={{
          address: { text: "12 fern" },
          business: { name: "harb" },
        }}
        open
      />,
    );

    const [first] = screen.getAllByTestId("grouped-firstAddress");
    expect(marks(first!)).toEqual(["12 Fern"]);
    const [harbor] = screen.getAllByTestId("business-line");
    expect(marks(harbor!)).toEqual(["Harb"]);
  });

  it("leaves an item without parts plain, and every item under the plain emphasis", () => {
    const parted = withParts({ highlight: ridgeline });
    const { business } = drawAddresses(parted);
    expect(marks(business[1]!)).toEqual([]);
    expect(business[1]!.querySelector(".bl-ac-line-name")).not.toHaveAttribute(
      "data-emphasis",
    );
    cleanup();

    const plain = drawAddresses(parted, { matchEmphasis: "plain" });
    expect(marks(plain.business[0]!)).toEqual([]);
  });
});

// A person search filtered by its businesses' states says which of a
// business's states the filter matched, as a business row does: right after
// the domicile, never behind the +N, and marked, on a business the service
// says is why the person is here. The filters are the ones the rows were
// fetched with; an address's own state filter says nothing of the businesses
// filed at it.
describe("the states a filter matched on a business line", () => {
  const view = {
    onInputChange: () => {},
    onSelect: () => {},
    found: 1,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: null,
    isSearching: false,
    error: null,
    open: true,
  };
  const squares = (line: HTMLElement) =>
    within(line)
      .queryAllByTestId("business-suggestion-state")
      .map(state => [state.textContent, state.hasAttribute("data-matched")]);

  /**
   * `PEOPLE` as a `business.state` and `business.name` search answers it:
   * Dana's Harbor, in FL, matched both; Cobalt, in FL too, matched neither,
   * and is listed only as another of Dana's businesses.
   */
  function filtered(harbor: object = {}) {
    const copy = structuredClone(PEOPLE);
    const [harborItem, , cobaltItem] =
      copy.suggestions[0]!.related.businesses.items;
    Object.assign(harborItem!, { matched: true, ...harbor });
    Object.assign(cobaltItem!, { states: ["FL"], domicile_state: "FL" });
    return copy;
  }

  it("moves the business.state a matched business has behind its domicile, and marks it", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={filtered().suggestions as never}
        appliedFilters={{ business: { state: ["fl"], name: "harbor" } }}
      />,
    );

    const [harbor, , cobalt] = screen.getAllByTestId("business-line");
    // Domicile PA first, then the matched FL, then the rest.
    expect(squares(harbor!)).toEqual([
      ["PA", false],
      ["FL", true],
      ["DE", false],
    ]);
    // Cobalt is in FL too, but the service does not say it matched.
    expect(squares(cobalt!)).toEqual([["FL", false]]);
  });

  it("never leaves a matched state behind the +N", () => {
    const wide = filtered({
      states: ["AZ", "CA", "DE", "NV", "NY", "OR"],
      domicile_state: "DE",
    });
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={wide.suggestions as never}
        appliedFilters={{ business: { state: ["NY"] } }}
      />,
    );

    const [harbor] = screen.getAllByTestId("business-line");
    expect(squares(harbor!)).toEqual([
      ["DE", false],
      ["NY", true],
      ["AZ", false],
    ]);
    expect(
      within(harbor!).getByTestId("business-suggestion-more-states"),
    ).toHaveTextContent("+3");
  });

  it("matches a state without regard to case or space on either side", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={
          filtered({ states: ["de", "fl", "pa"], domicile_state: "pa" })
            .suggestions as never
        }
        appliedFilters={{ business: { state: [" Fl "] } }}
      />,
    );

    const [harbor] = screen.getAllByTestId("business-line");
    expect(squares(harbor!)).toEqual([
      ["pa", false],
      ["fl", true],
      ["de", false],
    ]);
  });

  it("marks a domicile the filter named, though the wire leaves it out of the states", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={
          filtered({ states: ["DE", "PA"], domicile_state: "FL" })
            .suggestions as never
        }
        appliedFilters={{ business: { state: ["fl"] } }}
      />,
    );

    const [harbor] = screen.getAllByTestId("business-line");
    expect(squares(harbor!)).toEqual([
      ["FL", true],
      ["DE", false],
      ["PA", false],
    ]);
  });

  it("marks nothing without the filters the rows were fetched with", () => {
    render(
      <PersonAutocompleteView
        {...view}
        id="person"
        value="dana"
        suggestions={filtered().suggestions as never}
      />,
    );

    const [harbor] = screen.getAllByTestId("business-line");
    expect(squares(harbor!)).toEqual([
      ["PA", false],
      ["DE", false],
      ["FL", false],
    ]);
  });

  it("marks none of an address's businesses' states by the address's own state", () => {
    const matched = structuredClone(ADDRESSES);
    for (const item of matched.suggestions[0]!.related.businesses.items) {
      item.matched = true;
    }
    render(
      <AddressAutocompleteView
        {...view}
        id="address"
        value="45 corvel"
        suggestions={matched.suggestions as never}
        appliedFilters={{ state: ["DE"] }}
      />,
    );

    for (const line of screen.getAllByTestId("business-line")) {
      expect(squares(line).some(([, marked]) => marked)).toBe(false);
    }
  });

  it("marks what the person search sent, from the component", async () => {
    const fetch = vi.fn<FetchLike>(async url =>
      reply(
        200,
        answer(
          filtered(),
          (new URL(url).searchParams.get("include") ?? "businesses").split(","),
        ),
      ),
    );
    const client = createAutocompleteClient({
      baseUrl: BASE_URL,
      mint: async () => grant(SCOPE),
      fetch,
    });
    const { dana } = await typeDana(client, {
      filters: { business: { state: ["fl"] } },
    });

    // Sent as the host gave it, and matched without regard to case.
    expect(
      new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("business.state"),
    ).toBe("fl");
    const [harbor] = within(dana).getAllByTestId("business-line");
    expect(squares(harbor!)).toEqual([
      ["PA", false],
      ["FL", true],
      ["DE", false],
    ]);
  });
});

describe("a pick", () => {
  const input = () => screen.getByRole<HTMLInputElement>("combobox");
  const asked = (fetch: ReturnType<typeof setup>["fetch"]) =>
    fetch.mock.calls.map(([url]) => new URL(url).searchParams.get("q"));

  it("puts the person's name in the field without searching it", async () => {
    const { client, fetch } = setup();
    const { user } = await typeDana(client);

    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );
    await aMoment();

    expect(input().value).toBe("Dana Whitfield");
    expect(asked(fetch)).not.toContain("Dana Whitfield");
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });

  it("puts the address in the field without searching it", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} />);
    await user.type(screen.getByRole("combobox"), "45 corvel");
    const [business] = enabledOptions(
      await screen.findByRole("group", {
        name: "45 Corvel Landing Ste 200, Erie, PA 16507",
      }),
    );

    await user.click(business!);
    await aMoment();

    expect(input().value).toBe("45 Corvel Landing Ste 200, Erie, PA 16507");
    expect(asked(fetch)).not.toContain(
      "45 Corvel Landing Ste 200, Erie, PA 16507",
    );
    expect(screen.queryAllByRole("group")).toHaveLength(0);
  });

  it("reopens on the rows a business was picked from when the field is clicked", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    render(
      <>
        <PersonHost client={client} />
        <button type="button">elsewhere</button>
      </>,
    );
    await user.type(input(), "dana");
    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );
    await aMoment();
    const asked = fetch.mock.calls.length;
    expect(screen.queryAllByRole("group")).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    await user.click(input());

    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(input()).toHaveValue("Dana Whitfield");
    await aMoment();
    expect(fetch.mock.calls.length).toBe(asked);

    // A second pick from those rows, and they reopen again.
    await user.click(
      screen.getByRole("option", { name: /Harbor Concrete Pumping/ }),
    );
    await user.click(screen.getByRole("button", { name: "elsewhere" }));
    await user.click(input());
    expect(screen.getAllByRole("group")).toHaveLength(2);
    await aMoment();
    expect(fetch.mock.calls.length).toBe(asked);
  });

  it("lets typing search again", async () => {
    const { client, fetch } = setup();
    const { user } = await typeDana(client);
    await user.click(
      screen.getByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );

    await user.clear(input());
    await user.type(input(), "dana");

    expect(
      await screen.findByRole("group", { name: "Dana Whitfield" }),
    ).toBeTruthy();
    expect(asked(fetch).at(-1)).toBe("dana");
  });

  it("searches the picked name once the filters change, and not for the same filters in a new object", async () => {
    const { client, fetch } = setup();
    const user = userEvent.setup();
    const { rerender } = render(
      <PersonHost client={client} filters={{ business: { state: ["PA"] } }} />,
    );
    await user.type(input(), "dana");
    await user.click(
      await screen.findByRole("option", { name: /Cobalt Tile Supply LLC/ }),
    );
    await aMoment();
    const before = fetch.mock.calls.length;

    rerender(
      <PersonHost client={client} filters={{ business: { state: ["PA"] } }} />,
    );
    await aMoment();
    expect(fetch.mock.calls.length).toBe(before);

    rerender(
      <PersonHost client={client} filters={{ business: { state: ["DE"] } }} />,
    );
    await waitFor(() =>
      expect(fetch.mock.calls.length).toBeGreaterThan(before),
    );
    const url = new URL(fetch.mock.calls.at(-1)![0]);
    expect(url.searchParams.get("q")).toBe("Dana Whitfield");
    expect(url.searchParams.get("business.state")).toBe("DE");
  });
});

describe("a scope that grants none of a route's relations", () => {
  it("asks with no include, which the service narrows to the scope, and refuses nothing itself", async () => {
    const { client, fetch } = setup({ routes: { people: [] }, maxLimit: 20 });

    const { dana } = await typeDana(client);

    // The service refuses an empty include, so none is sent: it then expands
    // only what the session's scope allows, which here is nothing.
    expect(dana).toBeTruthy();
    expect(fetch).toHaveBeenCalled();
    for (const [url] of fetch.mock.calls) {
      expect(new URL(url).searchParams.has("include")).toBe(false);
    }
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

  it("names the address picked under a person, and leaves the person picked to the field", async () => {
    const { client } = setup();
    const { user } = await typeDana(client, {
      list: ["businesses", "addresses"],
      enabledLines: ["person", "address"],
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
    // The row itself picked: the field says it, and no line is drawn.
    expect(input().value).toBe("Danae Ortega");
    expect(selection()).toBeNull();
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
    // Still what was typed: the pick is kept for the name to come, and the
    // line waits for it too.
    expect(input().value).toBe("dana");
    expect(selection()).toBeNull();
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
        list={["businesses", "people"]}
        enabledLines={["business", "person"]}
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

describe("the order of a row's lines", () => {
  /** Each line of `group`, top to bottom, by what it draws. */
  const drawnOrder = (group: HTMLElement) =>
    [...group.querySelectorAll<HTMLElement>("[data-line]")].map(
      line => line.dataset.line,
    );
  /** What the keys move to, one ArrowDown at a time: each option's line. */
  async function keyOrder(user: ReturnType<typeof userEvent.setup>, n: number) {
    const input = screen.getByRole("combobox");
    const visited: (string | undefined)[] = [];
    for (let step = 0; step < n; step++) {
      await user.keyboard("{ArrowDown}");
      const active = input.getAttribute("aria-activedescendant")!;
      visited.push(document.getElementById(active)!.dataset.line);
    }
    return visited;
  }

  it("draws a person's lines in the list's order, the head first", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["addresses", "businesses"],
    });

    expect(drawnOrder(dana)).toEqual([
      "head",
      "address",
      "address",
      "business",
      "business",
      "business",
    ]);
  });

  it("moves the keys through a person's lines in the order they are drawn", async () => {
    const { client } = setup();
    const { user } = await typeDana(client, {
      list: ["addresses", "businesses"],
      enabledLines: ["business", "address"],
    });

    // Both addresses, now picks, then Dana's three businesses.
    expect(await keyOrder(user, 5)).toEqual([
      "address",
      "address",
      "business",
      "business",
      "business",
    ]);
  });

  it("moves the keys through an address's lines in the order they are drawn", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(
      <AddressHost
        client={client}
        list={["people", "businesses"]}
        enabledLines={["business", "person"]}
      />,
    );
    await user.type(screen.getByRole("combobox"), "45 corvel");
    await screen.findByRole("group", { name: /45 Corvel/ });

    expect(await keyOrder(user, 4)).toEqual([
      "person",
      "person",
      "business",
      "business",
    ]);
  });

  it("draws an address's lines in the list's order, the head first", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} list={["people", "businesses"]} />);
    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", { name: /45 Corvel/ });

    expect(drawnOrder(corvel)).toEqual([
      "head",
      "person",
      "person",
      "business",
      "business",
    ]);
  });
});

describe("a listed relation the session's scope leaves out", () => {
  const listsOf = (group: HTMLElement) =>
    [...group.querySelectorAll<HTMLElement>("[data-list]")].map(
      list => list.dataset.list,
    );

  it("is not drawn under a person, though the host lists it", async () => {
    const { client } = setup({
      routes: { people: ["businesses"] },
      maxLimit: 20,
    });
    const { dana } = await typeDana(client, {
      list: ["addresses", "businesses"],
    });

    expect(listsOf(dana)).toEqual(["businesses"]);
  });

  const NARROW: SessionScope = {
    routes: { people: ["businesses"] },
    maxLimit: 20,
  };
  /** Dana, who has businesses and addresses, has no list drawn empty. */
  const noEmptyList = () => {
    const dana = screen.getByRole("group", { name: "Dana Whitfield" });
    for (const list of dana.querySelectorAll("[data-list]")) {
      expect(list.querySelector("[data-line]"), list.outerHTML).not.toBeNull();
    }
  };

  it("draws rows by what they were asked for, though a wider grant has come since", async () => {
    let outcome = grant(NARROW);
    const { client } = setup(SCOPE, async () => outcome);
    const { dana } = await typeDana(client, {
      list: ["addresses", "businesses"],
    });
    expect(listsOf(dana)).toEqual(["businesses"]);

    outcome = grant(SCOPE);
    await act(async () => {
      await client.getSession({ force: true });
    });

    expect(
      listsOf(screen.getByRole("group", { name: "Dana Whitfield" })),
    ).toEqual(["businesses"]);
    noEmptyList();
  });

  it("draws rows by what they were asked for while a new grant is refused", async () => {
    let outcome: MintOutcome = grant(NARROW);
    const { client } = setup(SCOPE, async () => outcome);
    await typeDana(client, { list: ["addresses", "businesses"] });

    outcome = {
      kind: "refused",
      status: 503,
      code: null,
      retryAfterSeconds: 60,
      scope: null,
      message: null,
    };
    await act(async () => {
      await client.getSession({ force: true }).catch(() => undefined);
    });

    expect(client.getSnapshot().session.phase).not.toBe("ready");
    expect(
      listsOf(screen.getByRole("group", { name: "Dana Whitfield" })),
    ).toEqual(["businesses"]);
    noEmptyList();
  });

  it("keeps a row's lists whole when a narrower grant comes, until the next answer", async () => {
    let outcome = grant(SCOPE);
    const { client } = setup(SCOPE, async () => outcome);
    const { user, dana } = await typeDana(client, {
      list: ["addresses", "businesses"],
    });
    expect(listsOf(dana)).toEqual(["addresses", "businesses"]);

    outcome = grant(NARROW);
    await act(async () => {
      await client.getSession({ force: true });
    });
    expect(
      listsOf(screen.getByRole("group", { name: "Dana Whitfield" })),
    ).toEqual(["addresses", "businesses"]);
    noEmptyList();

    await user.type(screen.getByRole("combobox"), " w");
    await aMoment();
    expect(
      listsOf(await screen.findByRole("group", { name: "Dana Whitfield" })),
    ).toEqual(["businesses"]);
    noEmptyList();
  });

  it("keeps the rows' lists while the next answer is on its way", async () => {
    const { client, fetch } = setup();
    const { user, dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });
    expect(listsOf(dana)).toEqual(["businesses", "addresses"]);

    let release = () => {};
    const held = new Promise<void>(resolve => (release = resolve));
    const answer = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (...args) => {
      await held;
      return answer(...args);
    });
    await user.type(screen.getByRole("combobox"), "w");
    await aMoment();

    expect(
      listsOf(screen.getByRole("group", { name: "Dana Whitfield" })),
    ).toEqual(["businesses", "addresses"]);
    noEmptyList();
    release();
  });

  it("is not drawn where the service could not look, though it was asked for", async () => {
    const { client, fetch } = setup();
    const answer = fetch.getMockImplementation()!;
    fetch.mockImplementation(async (...args) => {
      const reply = await answer(...args);
      const body = (await reply.json()) as typeof PEOPLE;
      // Asked for, but not looked at: the source says so.
      const unlooked = {
        ...body,
        sources: { ...body.sources, addresses: { status: "unavailable" } },
      };
      return { ...reply, json: async () => unlooked };
    });
    const { dana } = await typeDana(client, {
      list: ["addresses", "businesses"],
    });

    expect(listsOf(dana)).toEqual(["businesses"]);
  });

  it("is not drawn under an address, though the host lists it", async () => {
    const { client } = setup({
      routes: { addresses: ["businesses"] },
      maxLimit: 20,
    });
    const user = userEvent.setup();
    render(<AddressHost client={client} list={["people", "businesses"]} />);
    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", { name: /45 Corvel/ });

    expect(listsOf(corvel)).toEqual(["businesses"]);
  });
});

describe("what the hook says its rows expanded", () => {
  async function expandedFor(
    client: Client,
    include?: ("businesses" | "addresses")[],
  ) {
    const { result } = renderHook(() =>
      useEntityAutocomplete({
        relation: "people",
        query: "dana",
        enabled: true,
        client,
        debounceMs: 0,
        ...(include !== undefined ? { include } : {}),
      }),
    );
    await waitFor(() => expect(result.current.suggestions).not.toHaveLength(0));
    return result.current.expanded;
  }

  it("is what the answer's sources say were looked at, with no include sent", async () => {
    const { client } = setup();
    // The service expands its default, businesses, and says so.
    expect(await expandedFor(client)).toEqual(["businesses"]);
  });

  it("is what was asked for, with an include sent", async () => {
    const { client } = setup();
    expect(await expandedFor(client, ["businesses", "addresses"])).toEqual([
      "businesses",
      "addresses",
    ]);
  });

  it("leaves out a relation the session's scope does not grant", async () => {
    const { client } = setup({
      routes: { people: ["businesses"] },
      maxLimit: 20,
    });
    expect(await expandedFor(client, ["businesses", "addresses"])).toEqual([
      "businesses",
    ]);
  });
});

describe("the icons", () => {
  /** Each icon in `element`: the SDK's glyph, or "host" for a host's own. */
  const glyphsOf = (element: Element) =>
    [...element.querySelectorAll<HTMLElement>(".bl-ac-icon")].map(
      icon => icon.dataset.glyph ?? "host",
    );

  it("draws one before every name by default: the person, each business, each address a pin", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
    });

    const head = within(dana).getByTestId("group-head");
    expect(glyphsOf(head)).toEqual(["person"]);
    expect(
      within(dana).getAllByTestId("business-line").flatMap(glyphsOf),
    ).toEqual(["building", "building", "building"]);
    // An address listed under a person carries no role: a pin, as the head's.
    expect(
      within(dana).getAllByTestId("address-line").flatMap(glyphsOf),
    ).toEqual(["pin", "pin"]);
    // Right before the name, and nothing a screen reader reads.
    const icon = head.querySelector<HTMLElement>(".bl-ac-icon")!;
    expect(icon.nextElementSibling).toHaveClass("bl-ac-name");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.dataset).toMatchObject({ entity: "person" });
    expect(icon).not.toHaveAttribute("data-role");
    expect(dana).toHaveAccessibleName("Dana Whitfield");
    const [address] = within(dana)
      .getAllByTestId("address-line")
      .map(line => line.querySelector<HTMLElement>(".bl-ac-icon")!);
    expect(address!.dataset).toMatchObject({ entity: "address", glyph: "pin" });
    expect(address).not.toHaveAttribute("data-role");
  });

  it("rides on the segments named, first in each, wherever the segment is placed", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      iconSegments: ["firstAddress", "address"],
      layout: { businessBadge: null, businessTrailing: "address" },
    });

    const head = within(dana).getByTestId("group-head");
    const first = within(head).getByTestId("grouped-firstAddress");
    expect(first.firstElementChild).toHaveClass("bl-ac-icon");
    // The person's own address has no role, so a pin.
    expect(glyphsOf(head)).toEqual(["pin"]);
    const [harbor] = within(dana).getAllByTestId("business-line");
    const address = within(harbor!).getByTestId("grouped-address");
    expect(address).toHaveAttribute("data-place", "businessTrailing");
    expect(address.firstElementChild).toHaveClass("bl-ac-icon");
    expect(address).toHaveTextContent("1200 Tallowmere Rd, Wilmington, DE");
    // A business's own address under a person: no role there, a map pin.
    expect(glyphsOf(harbor!)).toEqual(["pin"]);
  });

  it("draws a host's icon for an entity, and leaves a role's for where the service sends one", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
      icons: {
        address: <b data-testid="any-address">A</b>,
        "address:registered_office": <b data-testid="agent-address">G</b>,
      },
    });

    // An address under a person has no role, so it takes the entity's icon;
    // the agent's office is the key for a business's address, not this one.
    const lines = within(dana).getAllByTestId("address-line");
    for (const line of lines) {
      expect(within(line).getByTestId("any-address")).toBeInTheDocument();
      expect(within(line).queryByTestId("agent-address")).toBeNull();
      expect(glyphsOf(line)).toEqual(["host"]);
    }
    expect(glyphsOf(within(dana).getByTestId("group-head"))).toEqual([
      "person",
    ]);
  });

  it("hides the one a host sets to false, and leaves the rest", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, {
      list: ["businesses", "addresses"],
      icons: { address: false },
    });

    expect(
      within(dana).getAllByTestId("address-line").flatMap(glyphsOf),
    ).toEqual([]);
    expect(glyphsOf(within(dana).getByTestId("group-head"))).toEqual([
      "person",
    ]);
    expect(
      within(dana).getAllByTestId("business-line").flatMap(glyphsOf),
    ).toEqual(["building", "building", "building"]);
  });

  it("draws none with icons off", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, { icons: false });
    expect(dana.querySelectorAll(".bl-ac-icon")).toHaveLength(0);
  });

  it("draws none where no segment is named", async () => {
    const { client } = setup();
    const { dana } = await typeDana(client, { iconSegments: [] });
    expect(dana.querySelectorAll(".bl-ac-icon")).toHaveLength(0);
  });

  it("draws an address's head as a pin, and its people as people: they hold no role there", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<AddressHost client={client} list={["businesses", "people"]} />);
    await user.type(screen.getByRole("combobox"), "45 corvel");
    const corvel = await screen.findByRole("group", { name: /45 Corvel/ });

    expect(glyphsOf(within(corvel).getByTestId("group-head"))).toEqual(["pin"]);
    expect(
      within(corvel).getAllByTestId("person-line").flatMap(glyphsOf),
    ).toEqual(["person", "person"]);
  });
});
