import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  createAutocompleteClient,
  type EntityPick,
  type EntityType,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

import {
  BusinessAutocomplete,
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

function setup() {
  const fetch = vi.fn<FetchLike>(async () => reply(BODY));
  const mint: MintFunction = async () => ({
    kind: "granted",
    grant: {
      sessionToken: "sess-1",
      expiresIn: 300,
      requestBudget: 50,
      pivotAllowance: 5,
      filterMinStem: 3,
    },
  });
  return {
    fetch,
    client: createAutocompleteClient({ baseUrl: BASE_URL, mint, fetch }),
  };
}

type HostProps = Partial<
  Pick<BusinessAutocompleteProps, "list" | "layout" | "icons">
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

async function typeHarbor(props: HostProps = {}) {
  const { client, fetch } = setup();
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
  it("is a group: the business, then a line for each officer and address, each with its icon and role", async () => {
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
    expect(
      [
        ...harbor.querySelectorAll<HTMLElement>(
          ".bl-ac-group-line .bl-ac-icon",
        ),
      ].map(icon => icon.dataset.entity),
    ).toEqual(["person", "person", "address"]);
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

  it("draws an icon before the business's name where the layout puts one, and none with icons off", async () => {
    await typeHarbor({
      list: ["people"],
      layout: { titleLead: "titleIcon" },
    });
    const harbor = screen.getByRole("group");
    const title = harbor.querySelector(".bl-ac-line-title")!;
    expect(
      [...title.querySelectorAll<HTMLElement>(".bl-ac-icon")].map(
        icon => icon.dataset.entity,
      ),
    ).toEqual(["business"]);
  });

  it("draws no icons with icons off", async () => {
    await typeHarbor({ list: ["people", "addresses"], icons: false });

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
