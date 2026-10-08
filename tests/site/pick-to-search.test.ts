import { describe, expect, it } from "vitest";

import {
  businessPickFrom,
  pickableBusinesses,
} from "@baselayer-sdk/autocomplete";
import type { Pick } from "@baselayer-sdk/autocomplete/react";

import {
  SAMPLE_ADDRESSES,
  SAMPLE_PEOPLE,
  SAMPLE_SUGGESTIONS,
} from "../../site/demo/sample";
import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import {
  matchRows,
  pickFromRow,
  pickThrough,
} from "../../site/demo/search-view";

const PICKED_AT = 1_000;

describe("a pick from a business row", () => {
  it("is the row's business, where it is registered, and what it matched", () => {
    const row = SAMPLE_SUGGESTIONS[0]!;
    const pick: Pick = {
      businessToken: row.token,
      pickedAt: PICKED_AT,
      expiresAt: PICKED_AT + 900_000,
      matchedOn: [{ kind: "state", states: ["PA"] }],
    };

    const toSearch = pickFromRow(row, pick, ["pa"], {
      name: "harbor",
      person: "",
      address: "",
    });

    expect(toSearch).toMatchObject({
      name: "HARBOR CONCRETE PUMPING CO., INC.",
      about: "Domiciled in PA, registered in MD, NY, OH, PA, WV.",
      businessToken: row.token,
      expiresAt: PICKED_AT + 900_000,
    });
    expect(toSearch.matched.states).toEqual(["PA"]);
    expect(toSearch.matched.through).toBeNull();
  });
});

describe("a pick through a person", () => {
  const dana = SAMPLE_PEOPLE[0]!;
  const [pumping] = pickableBusinesses(dana);
  const toSearch = pickThrough(businessPickFrom(dana, pumping!, PICKED_AT), {
    typed: "dana whit",
    asked: ["PA"],
  });

  it("is the business, found through the person, who is the officer it matched", () => {
    expect(toSearch).toMatchObject({
      name: "HARBOR CONCRETE PUMPING CO., INC.",
      about: "Found through Dana Whitfield, an officer.",
      businessToken: pumping!.token,
    });
    expect(toSearch.matched).toMatchObject({
      officers: ["Dana Whitfield"],
      addresses: [],
      asked: ["PA"],
      typed: { name: "", person: "dana whit", address: "" },
      through: { route: "people", label: "Dana Whitfield", role: "officer" },
    });
  });

  it("names the officer in How it matched, against the search's own", () => {
    const rows = matchRows(
      { ...SAMPLE_SEARCH, officer_names: ["DANA WHITFIELD"] },
      toSearch.matched,
    );

    expect(rows.find(row => row.key === "officer")).toMatchObject({
      yours: "Dana Whitfield",
      found: "Dana Whitfield",
      pill: { tone: "good" },
    });
  });
});

describe("a pick through an address", () => {
  const agent = SAMPLE_ADDRESSES[1]!;
  const [northshore] = pickableBusinesses(agent);
  const toSearch = pickThrough(
    businessPickFrom(agent, northshore!, PICKED_AT),
    { typed: "77 quill", asked: [] },
  );

  it("is the business, found at the address, in the role it holds there", () => {
    expect(toSearch).toMatchObject({
      name: "NORTHSHORE PUMPING, LLC",
      about:
        "Found at 77 Quillfeather Ln Ste 300, Dover, DE 19904, its registered agent's office.",
    });
    expect(toSearch.matched).toMatchObject({
      officers: [],
      addresses: ["77 Quillfeather Ln Ste 300, Dover, DE 19904"],
      typed: { name: "", person: "", address: "77 quill" },
      through: {
        route: "addresses",
        label: "77 Quillfeather Ln Ste 300, Dover, DE 19904",
        role: "agent",
      },
    });
  });
});
