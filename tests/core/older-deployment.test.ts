import { describe, expect, it, vi } from "vitest";

import {
  AutocompleteError,
  createAutocompleteClient,
  parseMintResponse,
  type FetchLike,
  type MintFunction,
  type ResponseLike,
} from "@baselayer-sdk/autocomplete";

// A deployment from before the people and addresses routes: its mint answers
// no scope, and its businesses route still lists liens, carries no address,
// states or domicile on a related item, and may give an address no role.
// Made-up businesses, people and addresses.
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
            },
            {
              type: "person",
              token: "tok-ines",
              label: "Ines Marlowe",
              role: "agent",
              matched: false,
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
            },
            {
              type: "address",
              token: "tok-quillfeather",
              label: "77 Quillfeather Ln, Dover, DE 19904",
              role: "mailing",
              matched: false,
            },
            {
              type: "address",
              token: null,
              label: "48 Wrenmoor St, Pittsburgh, PA 15201",
              role: null,
              matched: false,
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

function olderDeployment() {
  const mint = vi.fn<MintFunction>(async () =>
    parseMintResponse(201, { get: () => null }, OLDER_MINT),
  );
  const fetch = vi.fn<FetchLike>(async () => reply(200, OLDER_ANSWER));
  const client = createAutocompleteClient({
    baseUrl: "https://api.test",
    mint,
    fetch,
  });
  return { client, mint, fetch };
}

describe("a deployment from before people and addresses", () => {
  it("mints a grant with no scope of its own", () => {
    const outcome = parseMintResponse(201, { get: () => null }, OLDER_MINT);

    expect(outcome.kind).toBe("granted");
    expect(outcome.kind === "granted" && "scope" in outcome.grant).toBe(false);
  });

  it("answers a business search: the liens dropped, the new fields null, its roles kept", async () => {
    const { client, fetch } = olderDeployment();

    const { response } = await client.search("businesses", {
      q: "harbor",
      include: ["people", "addresses"],
    });

    const sent = new URL(fetch.mock.calls[0]![0]).searchParams;
    expect([...sent.keys()].filter(key => !OLDER_PARAMS.includes(key))).toEqual(
      [],
    );
    expect(Object.keys(response.sources).sort()).toEqual([
      "addresses",
      "people",
    ]);
    const [harbor] = response.suggestions;
    expect(Object.keys(harbor!.related).sort()).toEqual([
      "addresses",
      "people",
    ]);
    expect(harbor!.related.people.items.map(item => item.role)).toEqual([
      "officer",
      "agent",
    ]);
    expect(harbor!.related.addresses.items.map(item => item.role)).toEqual([
      "principal",
      "mailing",
      null,
    ]);
    for (const item of [
      ...harbor!.related.people.items,
      ...harbor!.related.addresses.items,
    ]) {
      expect(item).toMatchObject({
        address: null,
        states: null,
        domicile_state: null,
      });
    }
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
