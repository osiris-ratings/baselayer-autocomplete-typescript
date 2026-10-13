import { describe, expect, it } from "vitest";

import {
  ADDRESS_LISTINGS,
  PERSON_ROLES,
  type AddressOfBusiness,
  type BusinessOfAddress,
  type BusinessOfPerson,
  type AddressListing,
  type PersonRole,
  type Open,
  type PersonOfBusiness,
  type RelatedAddress,
  type RelatedPerson,
} from "@baselayer-sdk/autocomplete";

import { DEFAULT_MESSAGES } from "../../src/react";
import { roleLabel, roleOf } from "../../src/react/roles";

// Made-up people, addresses and businesses.
const wesley: RelatedPerson = {
  type: "person",
  label: "Wesley Crane",
  matched: false,
  highlight: null,
};

const tideway: RelatedAddress = {
  type: "address",
  label: "12 Tideway Ln, Dover, DE 19901",
  matched: false,
  highlight: null,
};

const cinder = {
  type: "business" as const,
  token: "tok-cinder",
  label: "CINDER RIGGING, INC.",
  matched: false,
  matched_name: null,
  highlight: null,
  address: null,
  states: ["DE"],
  domicile_state: "DE",
};

const heldBy = (role: Open<PersonRole> | null): PersonOfBusiness => ({
  ...wesley,
  role,
});

const listedAs = (
  listed_as: Open<AddressListing> | null,
): BusinessOfAddress => ({
  ...cinder,
  listed_as,
});

describe("the default role labels", () => {
  it("name every role the contract lists, and no other", () => {
    expect(Object.keys(DEFAULT_MESSAGES.personRoles)).toEqual([
      ...PERSON_ROLES,
    ]);
    expect(Object.keys(DEFAULT_MESSAGES.addressRoles).sort()).toEqual(
      [...ADDRESS_LISTINGS].sort(),
    );
  });

  it("say a person's role as the role, and how an address was filed in words of its own", () => {
    expect(DEFAULT_MESSAGES.personRoles).toEqual({
      officer: "officer",
      agent: "agent",
    });
    expect(DEFAULT_MESSAGES.addressRoles).toEqual({
      principal: "principal office",
      mailing: "mailing address",
      registered_office: "agent",
      officer: "officer's address",
    });
  });
});

describe("roleOf", () => {
  it("reads the role a person holds on a business, listed under it or under a person", () => {
    const officer: PersonOfBusiness = { ...wesley, role: "officer" };
    const held: BusinessOfPerson = { ...cinder, role: "agent" };

    expect(roleOf(officer)).toBe("officer");
    expect(roleOf(held)).toBe("agent");
  });

  it("reads how a business filed an address, listed under it or under the address", () => {
    const filed: AddressOfBusiness = {
      ...tideway,
      listed_as: "registered_office",
    };
    const business: BusinessOfAddress = { ...cinder, listed_as: "mailing" };

    expect(roleOf(filed)).toBe("registered_office");
    expect(roleOf(business)).toBe("mailing");
  });

  it("is null where the relationship has no role", () => {
    // A person under an address, an address under a person, and an item the
    // filing names no role for.
    expect(roleOf(wesley)).toBeNull();
    expect(roleOf(tideway)).toBeNull();
    expect(roleOf(heldBy(null))).toBeNull();
    expect(roleOf(listedAs(null))).toBeNull();
  });

  it("gives a role this build does not know as the service sent it", () => {
    expect(roleOf(heldBy("director"))).toBe("director");
    expect(roleOf(listedAs("registered_office"))).toBe("registered_office");
  });
});

describe("roleLabel", () => {
  it("is the label the table has for the role", () => {
    expect(roleLabel(DEFAULT_MESSAGES.addressRoles, "registered_office")).toBe(
      "agent",
    );
    expect(roleLabel(DEFAULT_MESSAGES.personRoles, "officer")).toBe("officer");
  });

  it("is the role itself, as sent, when the table has none", () => {
    expect(roleLabel(DEFAULT_MESSAGES.personRoles, "director")).toBe(
      "director",
    );
    expect(roleLabel(DEFAULT_MESSAGES.addressRoles, "head_office")).toBe(
      "head_office",
    );
  });

  it("does not take a member of every object for a label", () => {
    for (const role of ["constructor", "toString", "__proto__"]) {
      expect(roleLabel(DEFAULT_MESSAGES.personRoles, role)).toBe(role);
    }
  });

  it("is what a host's own table says, for a role it names", () => {
    expect(
      roleLabel(
        { ...DEFAULT_MESSAGES.personRoles, agent: "process agent" },
        "agent",
      ),
    ).toBe("process agent");
  });
});
