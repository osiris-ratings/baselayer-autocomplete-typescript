import { describe, expect, it, vi } from "vitest";

import {
  AutocompleteError,
  ContractViolation,
  createAutocompleteClient,
  parseMintResponse,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

// A deployment from before the contract that names how a business lists an
// address `listed_as`, and before the people and addresses routes: its mint
// answers no scope, and its businesses route still lists liens, names how a
// business filed an address `role`, gives a related item a token or none, and
// carries no address, states or domicile on one. Made-up businesses, people
// and addresses.
const OLDER_MINT = {
  session_token: "grant-older",
  expires_in: 180,
  expires_at: "2026-10-08T12:03:00Z",
  request_budget: 30,
  pivot_allowance: 5,
  filter_min_stem: 5,
  sessions_per_window: 1000,
  sessions_per_day: 0,
  user_sessions_per_window: 60,
  user_sessions_per_day: 1000,
};

const OLDER_ANSWER = {
  query: "harbor",
  found: 1,
  found_capped: false,
  truncated: false,
  sources: {
    people: { status: "ok" },
    addresses: { status: "ok" },
    liens: { status: "ok" },
  },
  suggestions: [
    {
      type: "business",
      token: "tok-harbor",
      label: "HARBOR CONCRETE PUMPING, LLC",
      matched_name: null,
      match: "strong",
      domicile_state: "PA",
      states: ["OH", "PA"],
      structure: "LLC",
      highlight: [
        { text: "HARBOR", matched: true },
        { text: " CONCRETE PUMPING, LLC", matched: false },
      ],
      related: {
        people: {
          count: 2,
          matched: null,
          truncated: false,
          items: [
            {
              type: "person",
              token: "tok-dana",
              label: "Dana Whitfield",
              role: "officer",
              matched: false,
              highlight: null,
            },
            {
              type: "person",
              token: "tok-ines",
              label: "Ines Marlowe",
              role: "agent",
              matched: false,
              highlight: null,
            },
          ],
        },
        addresses: {
          count: 3,
          matched: null,
          truncated: false,
          items: [
            {
              type: "address",
              token: "tok-tallowmere",
              label: "1200 Tallowmere Rd, Pittsburgh, PA 15212",
              role: "principal",
              matched: false,
              highlight: null,
            },
            {
              type: "address",
              token: "tok-quillfeather",
              label: "77 Quillfeather Ln, Dover, DE 19904",
              role: "mailing",
              matched: false,
              highlight: null,
            },
            {
              type: "address",
              token: null,
              label: "48 Wrenmoor St, Pittsburgh, PA 15201",
              role: null,
              matched: false,
              highlight: null,
            },
          ],
        },
        liens: {
          count: 1,
          matched: null,
          truncated: false,
          items: [
            {
              type: "lien",
              token: null,
              label: "UCC 2026-0001",
              matched: false,
            },
          ],
        },
      },
    },
  ],
};

/** An answer from before even `truncated`, which the contract now requires. */
const OLDEST_ANSWER: Partial<typeof OLDER_ANSWER> = { ...OLDER_ANSWER };
delete OLDEST_ANSWER.truncated;

/** The parameters the older businesses route accepts; any other is a 422. */
const OLDER_PARAMS = [
  "address.city",
  "address.postal_code",
  "address.state",
  "address.text",
  "domicile_state",
  "include",
  "limit",
  "person.name",
  "person.role",
  "q",
  "state",
  "structure",
];

function reply(status: number, body: unknown): ResponseLike {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

function olderDeployment(answer: unknown = OLDER_ANSWER) {
  const mint = vi.fn<MintFunction>(async () =>
    parseMintResponse(201, { get: () => null }, OLDER_MINT),
  );
  const fetch = vi.fn<FetchLike>(async () => reply(200, answer));
  const client = createAutocompleteClient({
    baseUrl: "https://api.test",
    mint,
    fetch,
  });
  return { client, mint, fetch };
}

describe("a deployment from before this contract", () => {
  it("mints a grant with no scope of its own", () => {
    const outcome = parseMintResponse(201, { get: () => null }, OLDER_MINT);

    expect(outcome.kind).toBe("granted");
    expect(outcome.kind === "granted" && "scope" in outcome.grant).toBe(false);
  });

  it("is sent only what its businesses route accepts", async () => {
    const { client, fetch } = olderDeployment();

    await client
      .search("businesses", { q: "harbor", include: ["people", "addresses"] })
      .catch(() => null);

    const sent = new URL(fetch.mock.calls[0]![0]).searchParams;
    expect([...sent.keys()].filter(key => !OLDER_PARAMS.includes(key))).toEqual(
      [],
    );
  });

  it("refuses a business search's answer whole, naming the address's `role` it cannot read", async () => {
    const { client, fetch } = olderDeployment();

    const error = await client
      .search("businesses", { q: "harbor", include: ["people", "addresses"] })
      .then(
        () => null,
        (failure: unknown) => failure,
      );

    // Read as the contract it is on, an address's `role` would be no listing at
    // all: every address drawn without how it is listed. So nothing is read,
    // and the host is told what to look at.
    expect(error).toBeInstanceOf(AutocompleteError);
    expect(error).toMatchObject({
      kind: "contract",
      status: 200,
      message: expect.stringContaining(
        "response.suggestions[0].related.addresses.items[0].role",
      ) as string,
    });
    const { cause } = error as AutocompleteError;
    expect(cause).toBeInstanceOf(ContractViolation);
    expect(cause).toMatchObject({
      path: "response.suggestions[0].related.addresses.items[0].role",
      message: expect.stringMatching(
        /`listed_as`.*still serves the one before it/,
      ) as string,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("is refused for an answer from before `truncated` too, naming it first", async () => {
    const { client } = olderDeployment(OLDEST_ANSWER);

    const error = await client.search("businesses", { q: "harbor" }).then(
      () => null,
      (failure: unknown) => failure,
    );

    expect(error).toMatchObject({ kind: "contract" });
    expect((error as AutocompleteError).cause).toMatchObject({
      path: "response.truncated",
    });
  });

  it("refuses a person or an address search before sending it, its scope being businesses alone", async () => {
    const { client, fetch } = olderDeployment();

    for (const [route, q] of [
      ["people", "dana"],
      ["addresses", "1200 tallowmere"],
    ] as const) {
      const error = await client.search(route, { q }).then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(error).toBeInstanceOf(AutocompleteError);
      expect(error).toMatchObject({ kind: "out_of_scope", route });
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
