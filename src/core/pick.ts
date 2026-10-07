import type {
  AddressSuggestion,
  PersonSuggestion,
  RelatedItem,
  RelatedRole,
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
 * sealed by this deployment, or another organization's), 3042 (expired), 3023
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
export type PickableBusiness = RelatedItem & { token: string };

/** The person or address a pick came through, and the business's role there. */
export type PickedThrough =
  | { route: "people"; person: PersonSuggestion; role: RelatedRole | null }
  | {
      route: "addresses";
      address: AddressSuggestion;
      role: RelatedRole | null;
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
 * The businesses a person or address row offers to pick, in its order: those
 * the autocomplete service sealed a token for.
 */
export function pickableBusinesses(
  row: PersonSuggestion | AddressSuggestion,
): PickableBusiness[] {
  return row.related.businesses.items.filter(
    (item): item is PickableBusiness => item.token !== null,
  );
}

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
        ? { route: "people", person: row, role: business.role }
        : { route: "addresses", address: row, role: business.role },
  };
}
