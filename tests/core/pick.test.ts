import { describe, expect, it } from "vitest";

import {
  BUSINESS_TOKEN_TTL_SECONDS,
  TOKENS_NOT_CONFIGURED_CODE,
  refusedThePin,
} from "@baselayer/autocomplete";

/**
 * Which refusals of a tokened `POST /searches` retire the pin, ported from the
 * console's `refusedThePin.test.ts`. The console read an axios error; the SDK
 * takes the status and the envelope's code, 0 standing for no response.
 *
 * The recovery must not depend on recognising catalog codes. A refusal that
 * carries none is exactly the one a caller cannot escape: a client deployed
 * ahead of the API, or an API rolled back under it, gets a bare pydantic 422
 * for the unknown `business_token` field, and while the pin survived that,
 * every resubmit sent the same payload and got the same 422.
 */
describe("refusedThePin", () => {
  it.each([
    ["a token this key did not seal", 422, 3040],
    ["an expired token", 422, 3042],
    ["a business that is gone", 422, 3023],
    ["a sandbox application", 422, 3043],
    ["a locked organization", 402, 3004],
    ["no key configured on the deployment", 503, 3041],
  ])("retires the pin on %s", (_name, status, code) => {
    expect(refusedThePin(status, code)).toBe(true);
  });

  it("retires the pin on a 422 that carries no catalog code at all", () => {
    // `extra="forbid"` on the request model, which is what an API that predates
    // `business_token` answers. Enumerating codes missed this one, so the pin
    // was kept, the resubmit was identical, and the search never succeeded.
    expect(refusedThePin(422, null)).toBe(true);
  });

  it("does not treat a non-HTTP failure as a pin refusal", () => {
    // A network error has no response: nothing says the pin was at fault, and
    // retrying the same payload is the right thing to offer.
    expect(refusedThePin(0, null)).toBe(false);
  });

  it("does not treat a server fault as a pin refusal", () => {
    // A 500 is not the pin's fault and the caller should keep it: dropping it
    // would silently downgrade their next attempt to a text match.
    expect(refusedThePin(500, 1)).toBe(false);
  });

  it.each<[number, number | null]>([
    [500, null],
    [502, null],
    [503, null],
    [503, 481],
    [504, 3040],
  ])("does not treat a %i with code %s as a pin refusal", (status, code) => {
    expect(refusedThePin(status, code)).toBe(false);
  });

  it("names 3041 as the deployment without a token key", () => {
    expect(TOKENS_NOT_CONFIGURED_CODE).toBe(3041);
  });
});

describe("BUSINESS_TOKEN_TTL_SECONDS", () => {
  it("is the fifteen minutes the tier seals a token for", () => {
    expect(BUSINESS_TOKEN_TTL_SECONDS).toBe(900);
  });
});
