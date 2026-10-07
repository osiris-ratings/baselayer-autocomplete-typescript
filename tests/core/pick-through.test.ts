import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  businessPickFrom,
  pickableBusinesses,
  type AddressSuggestion,
  type PersonSuggestion,
  type RelatedItem,
} from "@baselayer-sdk/autocomplete";

// Made-up people, addresses and businesses.
const business = (
  label: string,
  token: string | null,
  role: RelatedItem["role"],
): RelatedItem => ({
  type: "business",
  token,
  label,
  role,
  matched: false,
  address: null,
  states: null,
  domicile_state: null,
});

const dana: PersonSuggestion = {
  type: "person",
  token: "tok-person-dana",
  label: "Dana Whitfield",
  matched_name: null,
  match: "exact",
  highlight: [{ text: "Dana Whitfield", matched: true }],
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
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

const office: AddressSuggestion = {
  type: "address",
  token: "tok-address-corvel",
  label: "45 Corvel Landing Ste 200, Erie, PA 16507",
  matched_name: null,
  match: "strong",
  highlight: [{ text: "45 Corvel Landing", matched: true }],
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
      items: [business("Ridgeline Freight LLC", "tok-b-ridgeline", "agent")],
    },
    people: { count: null, matched: null, truncated: false, items: [] },
  },
};

describe("pickableBusinesses", () => {
  it("offers a row's businesses that carry a token, in the row's order", () => {
    expect(pickableBusinesses(dana).map(item => item.token)).toEqual([
      "tok-b-harbor",
      "tok-b-cobalt",
    ]);
    expect(pickableBusinesses(office).map(item => item.label)).toEqual([
      "Ridgeline Freight LLC",
    ]);
  });
});

describe("businessPickFrom", () => {
  it("picks a business through the person it was reached by", () => {
    const [harbor] = pickableBusinesses(dana);

    expect(businessPickFrom(dana, harbor!, 1_000)).toEqual({
      businessToken: "tok-b-harbor",
      businessName: "Harbor Concrete Pumping Co., Inc.",
      pickedAt: 1_000,
      expiresAt: 1_000 + BUSINESS_TOKEN_TTL_SECONDS * 1000,
      through: { route: "people", person: dana, role: "officer" },
    });
  });

  it("picks a business through the address it was reached by", () => {
    const [ridgeline] = pickableBusinesses(office);

    expect(businessPickFrom(office, ridgeline!, 5).through).toEqual({
      route: "addresses",
      address: office,
      role: "agent",
    });
  });
});
