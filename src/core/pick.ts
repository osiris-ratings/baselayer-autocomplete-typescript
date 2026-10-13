import type {
  AddressSuggestion,
  BusinessOfAddress,
  BusinessOfPerson,
  BusinessSuggestion,
  AddressListing,
  PersonRole,
  Open,
  PersonSuggestion,
} from "./wire";

/**
 * How long a `business_token` stays redeemable on `POST /searches`, from the
 * moment the autocomplete service sealed it. Advisory: the API is the one that
 * refuses a stale token (422 code 3042), and the recovery is the same as for
 * any refusal.
 */
export const BUSINESS_TOKEN_TTL_SECONDS = 900;

/** The API's code for "this deployment holds no business-token key" (a 503). */
export const TOKENS_NOT_CONFIGURED_CODE = 3041;

/**
 * Whether a failed search refused the pin rather than failing outright.
 *
 * Every 4xx a pinned search can answer is recovered the same way, by dropping
 * the token and searching by the `name` and `address` as typed: 3040 (not
 * sealed by this deployment, or another organization's or environment's: a
 * sandbox pick searched with a production key, or the reverse), 3042 (expired), 3023
 * (the business is gone), and a bare validation 422 from an API that predates
 * `business_token`. So is 503 code 3041, a
 * deployment without the key. Any other 5xx, and a network failure
 * (status 0), is not about the pin and is reported as the failure it is.
 *
 * It is true, too, for the 422 from a body that carries the token beside
 * `name` or `address`. That one is your backend's to fix, not to fall back
 * from: send the token on its own.
 */
export function refusedThePin(status: number, code: number | null): boolean {
  if (status <= 0) {
    return false;
  }
  if (status < 500) {
    return true;
  }
  return code === TOKENS_NOT_CONFIGURED_CODE;
}

/** A business on a person or address row that a pick can spend. */
export type PickableBusiness = BusinessOfPerson | BusinessOfAddress;

/**
 * The person or address a pick came through, and the role there: the one the
 * person holds on the business, or how the business lists the address.
 */
export type PickedThrough =
  | {
      route: "people";
      person: PersonSuggestion;
      role: Open<PersonRole> | null;
    }
  | {
      route: "addresses";
      address: AddressSuggestion;
      listedAs: Open<AddressListing> | null;
    };

/**
 * A business picked from a person or address row: the same token a business
 * row's pick spends, and how it was reached.
 */
export interface BusinessPick {
  /** The sealed token to send as `business_token` on `POST /searches`. */
  businessToken: string;
  /** The business's name as the row showed it, for the name field. */
  businessName: string;
  pickedAt: number;
  /** Advisory: `pickedAt + BUSINESS_TOKEN_TTL_SECONDS`. */
  expiresAt: number;
  through: PickedThrough;
}

/**
 * The businesses a person or address row offers to pick, in its order: each
 * carries the sealed token a pick spends.
 */
export function pickableBusinesses(
  row: PersonSuggestion | AddressSuggestion,
): PickableBusiness[] {
  return row.related.businesses.items;
}

/**
 * A person or an address picked from a person's or an address's row: the row
 * itself, or one it lists. Nothing redeems a token yet; keep it as the opaque
 * handle it is.
 */
export interface EntityPick {
  type: "person" | "address";
  /**
   * The row's own `token`. Null for a person or an address listed under a row:
   * the autocomplete service seals no token for those.
   */
  token: string | null;
  label: string;
}

/** What an enabled line of a person's or an address's row hands when picked. */
export type GroupedOption =
  | {
      /** A business row's own head, picked as a business row always is. */
      kind: "row";
      row: BusinessSuggestion;
    }
  | {
      kind: "business";
      /** The row it was reached through, for `businessPickFrom`. */
      row: PersonSuggestion | AddressSuggestion;
      business: PickableBusiness;
    }
  | {
      kind: "entity";
      /** The row it is, or the row that lists it. */
      row: PersonSuggestion | AddressSuggestion | BusinessSuggestion;
      pick: EntityPick;
    };

/** The pick of `business` from `row`, made at `pickedAt` (epoch ms). */
export function businessPickFrom(
  row: PersonSuggestion | AddressSuggestion,
  business: PickableBusiness,
  pickedAt: number,
): BusinessPick {
  return {
    businessToken: business.token,
    businessName: business.label,
    pickedAt,
    expiresAt: pickedAt + BUSINESS_TOKEN_TTL_SECONDS * 1000,
    through:
      row.type === "person"
        ? {
            route: "people",
            person: row,
            role: "role" in business ? business.role : null,
          }
        : {
            route: "addresses",
            address: row,
            listedAs: "listed_as" in business ? business.listed_as : null,
          },
  };
}
