import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createAutocompleteClient,
  parseSuggestResponse,
  type EntityPick,
  type EntityType,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
  type SessionScope,
} from "@baselayer-sdk/autocomplete";

import {
  BusinessAutocomplete,
  BusinessAutocompleteView,
  type BusinessAutocompleteProps,
} from "../../src/react";

// Made-up businesses, people and addresses.
const BASE_URL = "https://api.example.test";

function reply(body: unknown): ResponseLike {
  return {
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => body,
  };
}

const item = (
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

const BODY = {
  query: "harbor",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: { people: { status: "ok" }, addresses: { status: "ok" } },
  suggestions: [
    {
      type: "business",
      token: "tok-harbor",
      label: "HARBOR CONCRETE PUMPING CO., INC.",
      matched_name: null,
      match: "strong",
      domicile_state: "PA",
      states: ["OH", "PA"],
      structure: "C_CORPORATION",
      related: {
        people: {
          count: 4,
          matched: null,
          truncated: true,
          items: [
            item("person", "Dana Whitfield", "tok-dana", "officer"),
            item("person", "Meridian Registered Agents, LLC", null, "agent"),
          ],
        },
        addresses: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            item(
              "address",
              "1200 Tallowmere Rd, Pittsburgh, PA 15212",
              "tok-tallowmere",
              "principal",
            ),
          ],
        },
      },
      highlight: [{ text: "HARBOR", matched: true }],
    },
  ],
};

function setup(body: unknown = BODY, scope?: SessionScope) {
  const fetch = vi.fn<FetchLike>(async () => reply(body));
  const mint: MintFunction = async () => ({
    kind: "granted",
    grant: {
      sessionToken: "sess-1",
      expiresIn: 300,
      requestBudget: 50,
      pivotAllowance: 5,
      filterMinStem: 3,
      ...(scope !== undefined ? { scope } : {}),
    },
  });
  return {
    fetch,
    client: createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch }),
  };
}

type HostProps = Partial<
  Pick<BusinessAutocompleteProps, "list" | "layout" | "icons" | "iconSegments">
> & {
  enabledLines?: EntityType[];
  onPick?: () => void;
  onPickEntity?: (pick: EntityPick) => void;
};

function Host({
  client,
  onPick = () => {},
  onPickEntity = () => {},
  enabledLines = ["business"],
  ...rest
}: HostProps & { client: ReturnType<typeof setup>["client"] }) {
  const [value, setValue] = useState("");
  return (
    <BusinessAutocomplete
      client={client}
      id="business"
      label="Business name"
      value={value}
      debounceMs={0}
      onChange={setValue}
      onPick={onPick}
      onPickEntity={onPickEntity}
      enabledLines={enabledLines}
      {...rest}
    />
  );
}

async function typeHarbor(props: HostProps = {}, body: unknown = BODY) {
  const { client, fetch } = setup(body);
  const user = userEvent.setup();
  render(<Host client={client} {...props} />);
  await user.type(screen.getByRole("combobox"), "harbor");
  await screen.findAllByRole("option");
  return { user, fetch };
}

const input = () => screen.getByRole<HTMLInputElement>("combobox");
const selection = () => screen.queryByTestId("grouped-selection");

describe("a business row with nothing listed", () => {
  it("is one option, as it always was, with no group around it", async () => {
    await typeHarbor();

    expect(screen.queryByRole("group")).toBeNull();
    const [row] = screen.getAllByRole("option");
    expect(row).toHaveAttribute("data-testid", "business-suggestion");
    expect(row!.querySelector(".bl-ac-icon")).toBeNull();
  });
});

describe("a business row that lists its officers and addresses", () => {
  it("is a group: the business, then a line for each officer and address, each with its role and no icon", async () => {
    await typeHarbor({ list: ["people", "addresses"] });

    const harbor = screen.getByRole("group", {
      name: "HARBOR CONCRETE PUMPING CO., INC.",
    });
    const people = within(harbor).getAllByTestId("person-line");
    expect(people.map(line => line.textContent)).toEqual([
      "Dana Whitfieldofficer",
      "Meridian Registered Agents, LLCagent",
    ]);
    const [address] = within(harbor).getAllByTestId("address-line");
    expect(address).toHaveTextContent(
      "1200 Tallowmere Rd, Pittsburgh, PA 15212principal office",
    );
    expect(harbor.querySelectorAll(".bl-ac-icon")).toHaveLength(0);
    expect(within(harbor).getByText("+2 more not shown")).toBeInTheDocument();
  });

  it("keeps the business itself the one option, its head drawn as a row always is", async () => {
    await typeHarbor({ list: ["people", "addresses"] });

    const harbor = screen.getByRole("group", {
      name: "HARBOR CONCRETE PUMPING CO., INC.",
    });
    const [head] = within(harbor).getAllByRole("option");
    expect(within(harbor).getAllByRole("option")).toHaveLength(1);
    expect(head).toHaveAttribute("data-testid", "business-suggestion");
    expect(head!.querySelector(".bl-ac-line-title")).not.toBeNull();
    for (const line of within(harbor).getAllByTestId("person-line")) {
      expect(line).toHaveAttribute("role", "presentation");
    }
  });

  it("draws its lines in the list's order, after the business, and the keys follow", async () => {
    const { user } = await typeHarbor({
      list: ["addresses", "people"],
      enabledLines: ["business", "person", "address"],
    });

    const harbor = screen.getByRole("group");
    expect(
      [...harbor.querySelectorAll<HTMLElement>("[data-line]")].map(
        line => line.dataset.line,
      ),
    ).toEqual(["address", "person", "person"]);
    const input = screen.getByRole("combobox");
    const visited: (string | null)[] = [];
    for (let step = 0; step < 3; step++) {
      await user.keyboard("{ArrowDown}");
      const active = document.getElementById(
        input.getAttribute("aria-activedescendant")!,
      )!;
      visited.push(active.getAttribute("data-testid"));
    }
    // The business, its address, then the officer with a token.
    expect(visited).toEqual([
      "business-suggestion",
      "address-line",
      "person-line",
    ]);
  });

  it("draws a relation listed twice once, each option once", async () => {
    await typeHarbor({
      list: ["addresses", "people", "addresses"],
      enabledLines: ["business", "person", "address"],
    });

    const harbor = screen.getByRole("group");
    expect(
      [...harbor.querySelectorAll<HTMLElement>("[data-list]")].map(
        list => list.dataset.list,
      ),
    ).toEqual(["addresses", "people"]);
    const ids = screen.getAllByRole("option").map(option => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws a relation listed twice once, handed to the view as it is", () => {
    const { suggestions } = parseSuggestResponse("businesses", BODY);
    render(
      <BusinessAutocompleteView
        id="business"
        value="harbor"
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
        open
        list={["addresses", "people", "addresses"]}
        enabledLines={["business", "person", "address"]}
      />,
    );

    expect(
      [...document.querySelectorAll<HTMLElement>("[data-list]")].map(
        list => list.dataset.list,
      ),
    ).toEqual(["addresses", "people"]);
    const ids = screen.getAllByRole("option").map(option => option.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("draws only what the session's scope lists, and a row left nothing to list as the one option it always was", async () => {
    const { client } = setup(BODY, {
      routes: { businesses: ["people"] },
      maxLimit: 20,
    });
    const user = userEvent.setup();
    render(<Host client={client} list={["addresses"]} />);
    await user.type(screen.getByRole("combobox"), "harbor");

    const [row] = await screen.findAllByRole("option");
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.querySelector("[data-list]")).toBeNull();
    expect(row).toHaveAttribute("data-testid", "business-suggestion");
  });

  it("asks for what it lists, though the layout draws none of it", async () => {
    const { fetch } = await typeHarbor({
      list: ["people"],
      layout: { subtitle: null, subtitleTrailing: null },
    });

    expect(
      new URL(fetch.mock.calls.at(-1)![0]).searchParams.get("include"),
    ).toBe("people");
  });

  it("picks the business from its head as it always has, and draws no line under the field", async () => {
    const onPick = vi.fn();
    const { user } = await typeHarbor({ list: ["people"], onPick });

    await user.click(screen.getAllByRole("option")[0]!);

    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toMatchObject({ token: "tok-harbor" });
    expect(input().value).toBe("HARBOR CONCRETE PUMPING CO., INC.");
    expect(selection()).toBeNull();
  });

  it("picks an officer as a typed pick, the business's name in the field and the officer under it", async () => {
    const onPick = vi.fn();
    const onPickEntity = vi.fn<(pick: EntityPick) => void>();
    const { user } = await typeHarbor({
      list: ["people"],
      enabledLines: ["business", "person"],
      onPick,
      onPickEntity,
    });

    await user.click(screen.getByRole("option", { name: /^Dana Whitfield/ }));

    expect(onPickEntity).toHaveBeenCalledWith({
      type: "person",
      token: "tok-dana",
      label: "Dana Whitfield",
    });
    expect(onPick).not.toHaveBeenCalled();
    expect(input().value).toBe("HARBOR CONCRETE PUMPING CO., INC.");
    expect(selection()).toHaveTextContent("Dana Whitfield");
    expect(input()).toHaveAccessibleDescription("Dana Whitfield");
  });

  it("draws no icons with icons off", async () => {
    await typeHarbor({
      list: ["people", "addresses"],
      iconSegments: ["name", "address", "people", "personName", "addressName"],
      icons: false,
    });

    expect(
      screen.getByRole("group").querySelectorAll(".bl-ac-icon"),
    ).toHaveLength(0);
  });

  it("draws a business that is not itself a pick as a disabled group, though it lists nothing", async () => {
    const { client } = setup();
    const user = userEvent.setup();
    render(<Host client={client} enabledLines={["person"]} />);

    await user.type(screen.getByRole("combobox"), "harbor");

    expect(
      await screen.findByRole("group", {
        name: "HARBOR CONCRETE PUMPING CO., INC.",
      }),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("needs somewhere to send an officer or an address picked", () => {
    const client = setup().client;
    const props = {
      client,
      id: "business",
      value: "",
      onChange: () => {},
      onPick: () => {},
    };

    // @ts-expect-error: an officer to pick needs onPickEntity.
    const bare = <BusinessAutocomplete {...props} enabledLines={["person"]} />;
    const businessesOnly = (
      <BusinessAutocomplete {...props} enabledLines={["business"]} />
    );

    expect([bare, businessesOnly]).toHaveLength(2);
  });
});

describe("the icons on a business row", () => {
  /** Each icon in `element`: the SDK's glyph, or "host" for a host's own. */
  const glyphsOf = (element: Element) =>
    [...element.querySelectorAll<HTMLElement>(".bl-ac-icon")].map(
      icon => icon.dataset.glyph ?? "host",
    );
  const ALL = [
    "name",
    "address",
    "people",
    "personName",
    "addressName",
  ] as const;

  it("rides on each segment named: the name, the address by its role, the officer, each listed name", async () => {
    await typeHarbor({ list: ["people", "addresses"], iconSegments: [...ALL] });
    const harbor = screen.getByRole("group");

    const name = within(harbor).getByTestId("business-suggestion-name");
    expect(name.previousElementSibling).toHaveClass("bl-ac-icon");
    expect(glyphsOf(name.parentElement!)).toEqual(["building"]);
    const address = within(harbor).getByTestId("business-suggestion-address");
    expect(address.firstElementChild).toHaveClass("bl-ac-icon");
    expect(glyphsOf(address)).toEqual(["pin"]);
    const officer = within(harbor).getByTestId("business-suggestion-officers");
    expect(officer.firstElementChild).toHaveClass("bl-ac-icon");
    expect(glyphsOf(officer)).toEqual(["person"]);
    expect(
      within(harbor).getAllByTestId("person-line").flatMap(glyphsOf),
    ).toEqual(["person", "briefcase"]);
    expect(
      within(harbor).getAllByTestId("address-line").flatMap(glyphsOf),
    ).toEqual(["pin"]);
  });

  it("draws one on a row that lists nothing, which stays the one option", async () => {
    await typeHarbor({ iconSegments: ["name"] });

    const [row] = screen.getAllByRole("option");
    expect(screen.queryByRole("group")).toBeNull();
    expect(glyphsOf(row!)).toEqual(["building"]);
  });

  it("draws an agent the same in the subtitle and on its own line", async () => {
    const agentOnly = {
      ...BODY,
      suggestions: [
        {
          ...BODY.suggestions[0]!,
          related: {
            ...BODY.suggestions[0]!.related,
            people: {
              count: 1,
              matched: null,
              truncated: false,
              items: [
                item(
                  "person",
                  "Meridian Registered Agents, LLC",
                  "tok-meridian",
                  "agent",
                ),
              ],
            },
          },
        },
      ],
    };
    await typeHarbor(
      { list: ["people"], iconSegments: ["people", "personName"] },
      agentOnly,
    );
    const harbor = screen.getByRole("group");

    const subtitle = glyphsOf(
      within(harbor).getByTestId("business-suggestion-officers"),
    );
    const line = within(harbor).getAllByTestId("person-line").flatMap(glyphsOf);
    expect(subtitle).toEqual(["briefcase"]);
    expect(line).toEqual(subtitle);
  });

  it("draws a mailing address as an envelope, by the role the address is held in", async () => {
    const [lead] = BODY.suggestions[0]!.related.addresses.items;
    const mailing = {
      ...BODY,
      suggestions: [
        {
          ...BODY.suggestions[0]!,
          related: {
            ...BODY.suggestions[0]!.related,
            addresses: {
              count: 1,
              matched: null,
              truncated: false,
              items: [{ ...lead!, role: "mailing" }],
            },
          },
        },
      ],
    };
    await typeHarbor({ iconSegments: ["address"] }, mailing);

    const address = screen.getByTestId("business-suggestion-address");
    expect(glyphsOf(address)).toEqual(["envelope"]);
    expect(address.querySelector(".bl-ac-icon")).toHaveAttribute(
      "data-role",
      "mailing",
    );
  });

  it("draws none on an address it does not have", async () => {
    const noAddress = {
      ...BODY,
      suggestions: [
        {
          ...BODY.suggestions[0]!,
          related: {
            ...BODY.suggestions[0]!.related,
            addresses: { count: 0, matched: null, truncated: false, items: [] },
          },
        },
      ],
    };
    await typeHarbor({ iconSegments: ["address"] }, noAddress);

    const address = screen.getByTestId("business-suggestion-address");
    expect(address).toHaveTextContent("No address on file");
    expect(address.querySelector(".bl-ac-icon")).toBeNull();
  });

  it("draws none by default, so the row is as it always was", async () => {
    await typeHarbor({ list: ["people", "addresses"] });

    expect(document.querySelectorAll(".bl-ac-icon")).toHaveLength(0);
  });
});
