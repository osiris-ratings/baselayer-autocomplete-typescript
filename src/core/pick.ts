/**
 * How long a `business_token` stays redeemable on `POST /searches`, from the
 * moment the tier sealed it. Advisory: the API is the one that refuses a stale
 * token (422 code 3042), and the recovery is the same as for any refusal.
 */
export const BUSINESS_TOKEN_TTL_SECONDS = 900;

/** The API's code for "this deployment holds no business-token key" (a 503). */
export const TOKENS_NOT_CONFIGURED_CODE = 3041;

/**
 * Whether a failed search refused the pin rather than failing outright.
 *
 * Every 4xx a pinned search can answer is recovered the same way, by dropping
 * the token and submitting the name as typed: 3040 (not sealed by this
 * deployment, or another organization's), 3042 (expired), 3023 (the business
 * is gone), 3043 (sandbox application), and a bare validation 422 from an API
 * that predates `business_token`. So is 503 code 3041, a deployment without
 * the key. Any other 5xx, and a network failure (status 0), is not about the
 * pin and is reported as the failure it is.
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
