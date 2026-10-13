import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  businessPickFrom,
  pickableBusinesses,
  type AddressSuggestion,
  type BusinessOfAddress,
  type BusinessOfPerson,
  type AddressListing,
  type PersonRole,
  type Open,
  type PersonSuggestion,
} from "@baselayer-sdk/autocomplete";

// Made-up people, addresses and businesses.
const related = (label: string, token: string) => ({
  type: "business" as const,
  token,
  label,
  matched: false,
  matched_name: null,
  highlight: null,
  address: null,
  states: ["DE"],
  domicile_state: "DE",
});

const heldBy = (
  label: string,
  token: string,
  role: Open<PersonRole> | null,
): BusinessOfPerson => ({ ...related(label, token), role });

const filedAt = (
  label: string,
  token: string,
  listed_as: Open<AddressListing> | null,
): BusinessOfAddress => ({ ...related(label, token), listed_as });

const dana: PersonSuggestion = {
  type: "person",
  token: "tok-person-dana",
  label: "Dana Whitfield",
  match: "exact",
  states: ["DE", "FL", "PA"],
  highlight: [{ text: "Dana Whitfield", matched: true }],
  related: {
    businesses: {
      count: 9,
      matched: null,
      truncated: true,
      items: [
        heldBy("Harbor Concrete Pumping Co., Inc.", "tok-b-harbor", "officer"),
        // A filing that names no role: the service sends no `role`, which reads null.
        heldBy("Quillon Salvage LLC", "tok-b-quillon", null),
        heldBy("Cobalt Tile Supply LLC", "tok-b-cobalt", "agent"),
      ],
    },
    addresses: { count: null, matched: null, truncated: false, items: [] },
  },
};

const office: AddressSuggestion = {
  type: "address",
  token: "tok-address-corvel",
  label: "45 Corvel Landing Ste 200, Erie, PA 16507",
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
      items: [
        filedAt(
          "Ridgeline Freight LLC",
          "tok-b-ridgeline",
          "registered_office",
        ),
        filedAt("Larkspur Haulage LLC", "tok-b-larkspur", "head_office"),
      ],
    },
    people: { count: null, matched: null, truncated: false, items: [] },
  },
};

describe("pickableBusinesses", () => {
  it("offers every business a row lists, in the row's order", () => {
    // Each carries the sealed token a pick spends: the service lists no
    // business under a person or an address without one.
    expect(pickableBusinesses(dana).map(item => item.token)).toEqual([
      "tok-b-harbor",
      "tok-b-quillon",
      "tok-b-cobalt",
    ]);
    expect(pickableBusinesses(office).map(item => item.label)).toEqual([
      "Ridgeline Freight LLC",
      "Larkspur Haulage LLC",
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

    const { through } = businessPickFrom(office, ridgeline!, 5);

    expect(through).toEqual({
      route: "addresses",
      address: office,
      listedAs: "registered_office",
    });
    // The role is `role` under a person and `listedAs` under an address, and
    // each route's pick names only its own.
    expect(through).not.toHaveProperty("role");
  });

  it("says no role when the filing names none", () => {
    const [, quillon] = pickableBusinesses(dana);

    expect(businessPickFrom(dana, quillon!, 5).through).toEqual({
      route: "people",
      person: dana,
      role: null,
    });
  });

  it("keeps a way of filing this build does not know as the service sent it", () => {
    const [, larkspur] = pickableBusinesses(office);

    expect(businessPickFrom(office, larkspur!, 5).through).toEqual({
      route: "addresses",
      address: office,
      listedAs: "head_office",
    });
  });

  it("keeps a role this build does not know as the service sent it", () => {
    const director: PersonSuggestion = {
      ...dana,
      related: {
        ...dana.related,
        businesses: {
          ...dana.related.businesses,
          items: [heldBy("Fernwood Capital LP", "tok-b-fernwood", "director")],
        },
      },
    };
    const [fernwood] = pickableBusinesses(director);

    expect(businessPickFrom(director, fernwood!, 5).through).toMatchObject({
      role: "director",
    });
  });
});
