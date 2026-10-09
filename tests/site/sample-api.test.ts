import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

import {
  parseMintResponse,
  parseSuggestResponse,
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

function mint(routes: readonly string[] = ALL, key = "any-key") {
  return answerSample(
    {
      method: "POST",
      path: "/autocomplete/sessions",
      headers: { "x-api-key": key, origin: "http://localhost:3000" },
      body: null,
    },
    { routes },
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

  it("keeps a person only when every filter finds something of theirs", () => {
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

  it("keeps the addresses a business whose name fits filed at, marked", () => {
    const parsed = parseSuggestResponse(
      "addresses",
      get("/autocomplete/addresses?q=77&business.name=northshore").body,
    );

    expect(parsed.suggestions.map(row => row.label)).toEqual([
      "77 Quillfeather Ln Ste 300, Dover, DE 19904",
    ]);
    expect(
      parsed.suggestions[0]!.related.businesses.items.filter(
        item => item.matched,
      ).map(item => item.label),
    ).toEqual(["NORTHSHORE PUMPING, LLC"]);
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
    const found = parseSearch(search(supply.token!).body);

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

    expect(parseSearch(search(northshore!.token!).body)?.officer_names).toBe(
      undefined,
    );
  });

  it("records the address an address row's token pins, as the API does", () => {
    const office = SAMPLE_ADDRESSES.find(
      row => row.components.city === "Dover",
    )!;
    const [northshore] = office.related.businesses.items;
    const found = parseSearch(search(northshore!.token!).body);

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
