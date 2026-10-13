import type {
  AddressOfBusiness,
  BusinessOfAddress,
  BusinessOfPerson,
  AddressListing,
  PersonRole,
  Open,
  PersonOfBusiness,
  RelatedAddress,
  RelatedBusiness,
  RelatedItem,
  RelatedPerson,
  RelatedSet,
} from "@baselayer-sdk/autocomplete";

// Made-up related items as the autocomplete service sends them: a business
// carries a token and what a row of its own would, a person and an address
// only a label. What a relation adds is its role: `role` on a person of a
// business and a business of a person, `listed_as` on an address of a business
// and a business of an address.

/** A relation's set: its items, counted, none of them filtered. */
export function relatedSet<Item extends RelatedItem>(
  items: Item[],
): RelatedSet<Item> {
  return { count: items.length, matched: null, truncated: false, items };
}

/** A business listed under a person or an address, before its role. */
export function relatedBusiness(
  label: string,
  overrides: Partial<RelatedBusiness> = {},
): RelatedBusiness {
  return {
    type: "business",
    token: `tok-${label}`,
    label,
    matched: false,
    matched_name: null,
    highlight: null,
    address: null,
    states: ["PA"],
    domicile_state: "PA",
    ...overrides,
  };
}

/** A business listed under a person, with the role they hold on it. */
export function businessOfPerson(
  label: string,
  role: Open<PersonRole> | null,
  overrides: Partial<RelatedBusiness> = {},
): BusinessOfPerson {
  return { ...relatedBusiness(label, overrides), role: role };
}

/** A business listed under an address, with how it filed the address. */
export function businessOfAddress(
  label: string,
  listedAs: Open<AddressListing> | null,
  overrides: Partial<RelatedBusiness> = {},
): BusinessOfAddress {
  return { ...relatedBusiness(label, overrides), listed_as: listedAs };
}

/** A person listed under an address, where they hold no role of their own. */
export function relatedPerson(
  label: string,
  overrides: Partial<RelatedPerson> = {},
): RelatedPerson {
  return {
    type: "person",
    label,
    matched: false,
    highlight: null,
    ...overrides,
  };
}

/** A person listed under a business, with the role they hold on it. */
export function personOfBusiness(
  label: string,
  role: Open<PersonRole> | null,
  overrides: Partial<RelatedPerson> = {},
): PersonOfBusiness {
  return { ...relatedPerson(label, overrides), role: role };
}

/** An address listed under a person, where they are at it with no role. */
export function relatedAddress(
  label: string,
  overrides: Partial<RelatedAddress> = {},
): RelatedAddress {
  return {
    type: "address",
    label,
    matched: false,
    highlight: null,
    ...overrides,
  };
}

/** An address listed under a business, with how the business filed it. */
export function addressOfBusiness(
  label: string,
  listedAs: Open<AddressListing> | null,
  overrides: Partial<RelatedAddress> = {},
): AddressOfBusiness {
  return { ...relatedAddress(label, overrides), listed_as: listedAs };
}
