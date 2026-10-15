import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import {
  parseErrorEnvelope,
  parseMintResponse,
  parseSuggestResponse,
  validationErrors,
} from "@baselayer-sdk/autocomplete";

import { readClaims } from "../../site/demo/credentials";
import {
  SAMPLE_ADDRESSES,
  SAMPLE_PEOPLE,
  SAMPLE_SUGGESTIONS,
  sampleToken,
} from "../../site/demo/sample";
import { answerSample } from "../../site/demo/sample-api";
import { parseSearch } from "../../site/demo/searches";

const ALL = ["businesses", "people", "addresses"] as const;

function mint(routes: readonly string[] = ALL, key = "any-key", stem?: number) {
  return answerSample(
    {
      method: "POST",
      path: "/autocomplete/sessions",
      headers: { "x-api-key": key, origin: "http://localhost:3000" },
      body: null,
    },
    { routes, ...(stem !== undefined ? { stem } : {}) },
  )!;
}

function session(routes: readonly string[] = ALL): string {
  return (mint(routes).body as { session_token: string }).session_token;
}

function get(path: string, routes: readonly string[] = ALL, token?: string) {
  return answerSample(
    {
      method: "GET",
      path,
      headers: { "x-autocomplete-session": token ?? session(routes) },
      body: null,
    },
    { routes },
  )!;
}

describe("the made-up API's mint", () => {
  it("grants any key a session over every route, as a grant the SDK reads", () => {
    const reply = mint();

    expect(reply.status).toBe(201);
    const outcome = parseMintResponse(201, null, reply.body);
    expect(outcome.kind).toBe("granted");
    expect(outcome.kind === "granted" && outcome.grant.scope).toEqual({
      routes: {
        businesses: ["people", "addresses"],
        people: ["businesses", "addresses"],
        addresses: ["businesses", "people"],
      },
      maxLimit: 20,
    });
    // The demo reads the grant's claims for its connection line.
    const claims = readClaims(
      outcome.kind === "granted" ? outcome.grant.sessionToken : "",
    );
    expect(claims?.org).toBe("sample");
    expect(claims?.ori).toBe("http://localhost:3000");
  });

  it("grants a filter stem of 5, as the service does by default, or the one it is told to", () => {
    const grant = (reply: ReturnType<typeof mint>) => {
      const outcome = parseMintResponse(201, null, reply.body);
      return outcome.kind === "granted" ? outcome.grant.filterMinStem : null;
    };

    expect(grant(mint())).toBe(5);
    expect(grant(mint(ALL, "any-key", 3))).toBe(3);
  });

  it("grants only the routes it is told to", () => {
    const outcome = parseMintResponse(201, null, mint(["businesses"]).body);

    expect(outcome.kind === "granted" && outcome.grant.scope?.routes).toEqual({
      businesses: ["people", "addresses"],
    });
  });

  it("refuses a mint without a key", () => {
    expect(mint(ALL, "").status).toBe(401);
  });
});

/** The keys of an object, sorted, as the wire spells them. */
const keys = (value: unknown): string[] =>
  Object.keys(value as Record<string, unknown>).sort();

const RELATED_SET = ["count", "items", "matched", "truncated"];
const LISTED = ["highlight", "label", "matched", "type"];
const RELATED_BUSINESS = [
  "address",
  "domicile_state",
  "highlight",
  "label",
  "matched",
  "matched_name",
  "states",
  "token",
  "type",
];

describe("the made-up API's answers, in the contract's shape", () => {
  type Body = {
    suggestions: {
      related: Record<string, { items: unknown[] }>;
      components: unknown;
    }[];
  };
  const body = (path: string): Body => get(path).body as Body;

  it("answers a business row with every key, the nullable ones null, and a person or an address listed under it with its role", () => {
    const reply = get(
      "/autocomplete/businesses?q=harbor%20concrete%20pum&limit=1",
    );
    const answer = reply.body as Body & Record<string, unknown>;
    const [row] = answer.suggestions;

    expect(keys(answer)).toEqual([
      "found",
      "found_capped",
      "query",
      "sources",
      "suggestions",
      "truncated",
    ]);
    expect(answer["truncated"]).toBe(false);
    expect(keys(row)).toEqual([
      "domicile_state",
      "highlight",
      "label",
      "match",
      "matched_name",
      "related",
      "states",
      "structure",
      "token",
      "type",
    ]);
    expect(row).toMatchObject({ type: "business", matched_name: null });
    expect(keys(row!.related)).toEqual(["addresses", "people"]);
    for (const relation of Object.values(row!.related)) {
      expect(keys(relation)).toEqual(RELATED_SET);
    }
    expect(keys(row!.related["people"]!.items[0])).toEqual([
      "highlight",
      "label",
      "matched",
      "role",
      "type",
    ]);
    expect(keys(row!.related["addresses"]!.items[0])).toEqual([
      "highlight",
      "label",
      "listed_as",
      "matched",
      "type",
    ]);
    // The SDK reads it whole.
    expect(
      parseSuggestResponse("businesses", reply.body).suggestions,
    ).toHaveLength(1);
  });

  it("answers a person row with the states of their businesses, no other name that matched, and no token on what is listed under it", () => {
    const answer = body(
      "/autocomplete/people?q=dana%20whit&include=businesses,addresses",
    );
    const [row] = answer.suggestions;

    expect(keys(row)).toEqual([
      "highlight",
      "label",
      "match",
      "related",
      "states",
      "token",
      "type",
    ]);
    expect(row).toMatchObject({
      type: "person",
      states: ["AZ", "CA", "MD", "NJ", "NV", "NY", "OH", "OR", "PA", "WV"],
    });
    expect(keys(row!.related)).toEqual(["addresses", "businesses"]);
    expect(keys(row!.related["businesses"]!.items[0])).toEqual(
      ["role", ...RELATED_BUSINESS].sort(),
    );
    expect(keys(row!.related["addresses"]!.items[0])).toEqual(LISTED);
  });

  it("answers an address row with every part, null where it has none, and no token on the people listed under it", () => {
    const answer = body(
      "/autocomplete/addresses?q=1200%20tall&include=businesses,people",
    );
    const [row] = answer.suggestions;

    expect(keys(row)).toEqual([
      "components",
      "highlight",
      "label",
      "match",
      "related",
      "token",
      "type",
    ]);
    expect(row!.components).toEqual({
      line1: "1200 Tallowmere Rd",
      line2: null,
      city: "Pittsburgh",
      state: "PA",
      postal_code: "15212",
    });
    expect(keys(row!.related["businesses"]!.items[0])).toEqual(
      ["listed_as", ...RELATED_BUSINESS].sort(),
    );
    expect(keys(row!.related["people"]!.items[0])).toEqual(LISTED);
  });

  it("answers a relation nobody asked for as not requested, empty", () => {
    const [row] = body(
      "/autocomplete/people?q=dana&include=businesses",
    ).suggestions;

    expect(row!.related["addresses"]).toEqual({
      count: null,
      matched: null,
      truncated: false,
      items: [],
    });
  });

  it("refuses a query too short in the catalog's envelope, naming the parameter", () => {
    const reply = get("/autocomplete/people?q=d");

    expect(reply.status).toBe(422);
    expect(reply.body).toEqual({
      code: 422,
      message: "The request is invalid.",
      uri: null,
      metadata: {
        reason: "request_invalid",
        errors: [
          {
            type: "too_short",
            loc: ["query", "q"],
            msg: "q is too short",
            ctx: {},
          },
        ],
      },
    });
    // The SDK reads the parameter it names.
    const envelope = parseErrorEnvelope(reply.body);
    expect(envelope && validationErrors(envelope)).toEqual([
      {
        type: "too_short",
        loc: ["query", "q"],
        msg: "q is too short",
        ctx: {},
      },
    ]);
  });
});

describe("the made-up API's searches", () => {
  it("finds the people whose names the typed words start, with their businesses", () => {
    const reply = get("/autocomplete/people?q=dana&include=businesses");

    expect(reply.status).toBe(200);
    const parsed = parseSuggestResponse("people", reply.body);
    expect(parsed.suggestions.map(row => row.label)).toEqual([
      "Dana Whitfield",
      "Dana Okafor",
      "Dana Kessler",
    ]);
    expect(parsed.found).toBe(3);
    expect(parsed.suggestions[0]!.highlight[0]).toEqual({
      text: "Dana",
      matched: true,
    });
    expect(parsed.sources.addresses.status).toBe("not_requested");
    expect(parsed.suggestions[0]!.related.addresses.items).toEqual([]);
    expect(parsed.suggestions[0]!.related.businesses.count).toBe(7);
  });

  it("keeps the people with a business in a state the filter names, marked", () => {
    const parsed = parseSuggestResponse(
      "people",
      get("/autocomplete/people?q=dana&business.state=TX").body,
    );

    expect(parsed.suggestions.map(row => row.label)).toEqual(["Dana Okafor"]);
    expect(
      parsed.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["CONCRETE HARBOR PARTNERS, LP"]);
  });

  it("keeps the people with a role on a business whose name fits, marked", () => {
    const parsed = parseSuggestResponse(
      "people",
      get("/autocomplete/people?q=dana&business.name=northshore").body,
    );

    expect(parsed.suggestions.map(row => row.label)).toEqual(["Dana Kessler"]);
    expect(
      parsed.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["NORTHSHORE PUMPING, LLC"]);
  });

  it("keeps the people who filed from an address that fits, the address marked", () => {
    const parsed = parseSuggestResponse(
      "people",
      get(
        "/autocomplete/people?q=dana&include=businesses,addresses&address.text=48%20corriway",
      ).body,
    );

    expect(parsed.suggestions.map(row => row.label)).toEqual([
      "Dana Whitfield",
    ]);
    expect(
      parsed.suggestions[0]!.related.addresses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["48 Corriway St, Pittsburgh, PA 15206"]);
  });

  it("keeps the people on a business whose own office the address is, but never through its agent's", () => {
    const office = parseSuggestResponse(
      "people",
      get("/autocomplete/people?q=dana&address.text=15%20corvel").body,
    );
    expect(office.suggestions.map(row => row.label)).toEqual([
      "Dana Whitfield",
    ]);
    expect(
      office.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["HARBOR CONCRETE SUPPLY, INC."]);

    // The registered agent's office of three of the Danas' businesses.
    const agents = parseSuggestResponse(
      "people",
      get("/autocomplete/people?q=dana&address.text=77%20quillfeather").body,
    );
    expect(agents.suggestions).toEqual([]);
  });

  it("never finds a registered agent by an address, filed from as one or through a business it is agent of", () => {
    // Corwin Ashby files from 1200 Tallowmere only as the registered agent of
    // the business whose mailing office it is, and whose own office is 15
    // Corvel St; Meridian files from its Dover office only as an agent.
    expect(
      parseSuggestResponse(
        "people",
        get("/autocomplete/people?q=corwin").body,
      ).suggestions.map(row => row.label),
    ).toEqual(["Corwin Ashby"]);
    for (const path of [
      "/autocomplete/people?q=corwin&address.text=1200%20tallowmere",
      "/autocomplete/people?q=corwin&address.text=15%20corvel",
      "/autocomplete/people?q=meridian&address.text=77%20quillfeather",
    ]) {
      expect(
        parseSuggestResponse("people", get(path).body).suggestions,
        path,
      ).toEqual([]);
    }
    // The officers who file from 1200 Tallowmere are found there.
    expect(
      parseSuggestResponse(
        "people",
        get("/autocomplete/people?q=dana&address.text=1200%20tallowmere").body,
      ).suggestions.map(row => row.label),
    ).toEqual(["Dana Whitfield"]);
  });

  it("holds a person's business filters to one business, which meets them all", () => {
    const labels = (path: string) =>
      parseSuggestResponse("people", get(path).body).suggestions.map(
        row => row.label,
      );
    // Dana Okafor's masonry business is in DC, MD and VA, and the Texas one
    // is another.
    expect(
      labels(
        "/autocomplete/people?q=dana&business.state=TX&business.name=masonry",
      ),
    ).toEqual([]);
    const okafor = parseSuggestResponse(
      "people",
      get("/autocomplete/people?q=dana&business.state=MD&business.name=masonry")
        .body,
    );
    expect(okafor.suggestions.map(row => row.label)).toEqual(["Dana Okafor"]);
    expect(
      okafor.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["HARBOR CONCRETE & MASONRY"]);
    // A business's office, too, is the same business's: the supply company's
    // is 15 Corvel St, the pumping company's 1200 Tallowmere.
    expect(
      labels(
        "/autocomplete/people?q=dana&business.name=supply&address.text=15%20corvel",
      ),
    ).toEqual(["Dana Whitfield"]);
    expect(
      labels(
        "/autocomplete/people?q=dana&business.name=pumping&address.text=15%20corvel",
      ),
    ).toEqual([]);
  });

  it("keeps a person on their business's filters and an address they filed from", () => {
    const parsed = parseSuggestResponse(
      "people",
      get(
        "/autocomplete/people?q=dana&business.state=PA&address.text=915%20silverkell",
      ).body,
    );

    expect(parsed.suggestions.map(row => row.label)).toEqual(["Dana Kessler"]);
  });

  it("keeps the addresses a person whose name fits filed from, marked", () => {
    const parsed = parseSuggestResponse(
      "addresses",
      get(
        "/autocomplete/addresses?q=1200&include=businesses,people&person.name=luis",
      ).body,
    );
    expect(parsed.suggestions.map(row => row.label)).toEqual([
      "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    ]);
    expect(
      parsed.suggestions[0]!.related.people.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["Luis Ortega"]);

    const nobody = parseSuggestResponse(
      "addresses",
      get("/autocomplete/addresses?q=1200&person.name=priya").body,
    );
    expect(nobody.suggestions).toEqual([]);
  });

  it("keeps the addresses a business whose name fits has its own office at, never its agent's or an officer's", () => {
    const parsed = parseSuggestResponse(
      "addresses",
      get("/autocomplete/addresses?q=1200&business.name=supply").body,
    );
    expect(parsed.suggestions.map(row => row.label)).toEqual([
      "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    ]);
    expect(
      parsed.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["HARBOR CONCRETE SUPPLY, INC."]);

    // Northshore files at the Dover office only through its registered
    // agent, and the masonry business at Pellington Hwy as an officer's.
    for (const path of [
      "/autocomplete/addresses?q=77&business.name=northshore",
      "/autocomplete/addresses?q=2210&business.name=masonry",
    ]) {
      expect(
        parseSuggestResponse("addresses", get(path).body).suggestions,
        path,
      ).toEqual([]);
    }
  });

  it("finds addresses by their words, and filters them by state", () => {
    const found = parseSuggestResponse(
      "addresses",
      get("/autocomplete/addresses?q=1200%20tallowmere").body,
    );
    expect(found.suggestions.map(row => row.label)).toEqual([
      "1200 Tallowmere Rd, Pittsburgh, PA 15212",
    ]);

    // "77" starts the Dover agent's office and the Galveston address's ZIP:
    // the state keeps only the second.
    const inTexas = parseSuggestResponse(
      "addresses",
      get("/autocomplete/addresses?q=77&state=TX").body,
    );
    expect(inTexas.suggestions.map(row => row.components.state)).toEqual([
      "TX",
    ]);
  });

  it("finds businesses, at most the limit", () => {
    const parsed = parseSuggestResponse(
      "businesses",
      get("/autocomplete/businesses?q=harbor%20concr&limit=2").body,
    );

    expect(parsed.suggestions).toHaveLength(2);
    expect(parsed.found).toBeGreaterThan(2);
  });

  it("refuses a route outside the session's scope, as the service does", () => {
    const reply = get("/autocomplete/people?q=dana", ["businesses"]);

    expect(reply.status).toBe(403);
    expect(reply.body).toMatchObject({ code: 501 });
  });

  it("refuses a request without a session", () => {
    expect(get("/autocomplete/people?q=dana", ALL, "").status).toBe(401);
  });
});

describe("the made-up API's business search", () => {
  function search(token: string) {
    return answerSample(
      {
        method: "POST",
        path: "/searches",
        headers: { "x-api-key": "any-key" },
        body: JSON.stringify({ business_token: token }),
      },
      { routes: ALL },
    )!;
  }

  it("answers a picked sample business with a finished search of it", () => {
    const pumping = SAMPLE_SUGGESTIONS[0]!;
    const reply = search(sampleToken(pumping.label));

    expect(reply.status).toBe(201);
    const found = parseSearch(reply.body);
    expect(found?.state).toBe("COMPLETED");
    expect(found?.business?.name).toBe(pumping.label);
  });

  it("names the business picked, whichever it is, with its own officers", () => {
    const masonry = SAMPLE_SUGGESTIONS.find(
      row => row.label === "HARBOR CONCRETE & MASONRY",
    )!;
    const found = parseSearch(search(sampleToken(masonry.label)).body);

    expect(found?.name).toBe("HARBOR CONCRETE & MASONRY");
    expect(found?.business?.incorporation_state).toBe("MD");
    expect(found?.business?.business_officers?.map(o => o.name)).toContain(
      "GRACE ODUYA",
    );
  });

  it("records the officer a person row's token pins, as the API does", () => {
    const dana = SAMPLE_PEOPLE.find(row => row.label === "Dana Whitfield")!;
    const supply = dana.related.businesses.items.find(
      item => item.label === "HARBOR CONCRETE SUPPLY, INC.",
    )!;
    const found = parseSearch(search(supply.token).body);

    expect(found?.name).toBe("HARBOR CONCRETE SUPPLY, INC.");
    expect(found?.officer_names).toEqual(["DANA WHITFIELD"]);
    expect(found?.business?.business_officers?.map(o => o.name)).toContain(
      "DANA WHITFIELD",
    );
  });

  it("pins no officer through a registered agent", () => {
    const meridian = SAMPLE_PEOPLE.find(row =>
      row.label.startsWith("Meridian"),
    )!;
    const [northshore] = meridian.related.businesses.items;

    expect(parseSearch(search(northshore!.token).body)?.officer_names).toBe(
      undefined,
    );
  });

  it("records the address an address row's token pins, as the API does", () => {
    const office = SAMPLE_ADDRESSES.find(
      row => row.components.city === "Dover",
    )!;
    const [northshore] = office.related.businesses.items;
    const found = parseSearch(search(northshore!.token).body);

    expect(found?.name).toBe("NORTHSHORE PUMPING, LLC");
    expect(found?.address).toBe("77 QUILLFEATHER LN STE 300, DOVER, DE 19904");
  });

  it("refuses a token it never sealed, as the API does", () => {
    const reply = search("not-a-sample-token");

    expect(reply.status).toBe(422);
    expect(reply.body).toMatchObject({ code: 3040 });
  });
});

describe("what the made-up API does not answer", () => {
  it("leaves any other path to the dev server", () => {
    expect(
      answerSample(
        { method: "GET", path: "/demo/", headers: {}, body: null },
        { routes: ALL },
      ),
    ).toBeNull();
  });
});

describe("the made-up API in a build", () => {
  it("never reaches the published site", async () => {
    const outDir = mkdtempSync(join(tmpdir(), "site-build-"));
    try {
      await build({
        configFile: join(__dirname, "../../site/vite.config.ts"),
        logLevel: "silent",
        build: { outDir, emptyOutDir: true },
      });
      const code = readdirSync(join(outDir, "assets"))
        .filter(file => file.endsWith(".js"))
        .map(file => readFileSync(join(outDir, "assets", file), "utf8"))
        .join("\n");

      // The made-up rows ship, for Styling's preview: the scan sees them.
      expect(code).toContain("Dana Whitfield");
      // The made-up API's own strings do not.
      expect(code).not.toContain("sample.invalid");
      expect(code).not.toContain("not sealed for your organization");
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  }, 120_000);
});
