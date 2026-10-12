// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurl } from "../../site/api/curl";
import type { JsonSchema } from "../../site/api/spec/assemble";
import { buildReference } from "../../site/api/spec/plugin";
import { TryIt, type LiveResponse } from "../../site/api/TryIt";

// The page's document, assembled from contracts/ as the build assembles it.
// Under jsdom a module's URL is no file's, so the root is where the run is.
const { document: reference } = buildReference(process.cwd());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function editor(path: string) {
  const [method, operation] = Object.entries(reference.paths[path]!)[0]!;
  const source = (operation["x-codeSamples"] ?? []).find(
    sample => sample.lang === "shell",
  )!.source;
  const body = (
    operation["requestBody"] as
      { content: Record<string, { schema: JsonSchema }> } | undefined
  )?.content["application/json"]?.schema;
  const onCode = vi.fn<(code: string) => void>();
  const onResponse = vi.fn<(response: LiveResponse) => void>();
  render(
    <TryIt
      method={method}
      sample={parseCurl(source)!}
      body={body}
      schemas={reference.components?.schemas ?? {}}
      onCode={onCode}
      onResponse={onResponse}
    />,
  );
  const code = () => onCode.mock.lastCall![0];
  return { code, onResponse, user: userEvent.setup() };
}

/** A `fetch` that answers once, as the API would. */
function answering(status: number, body: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Try it here, on the mint", () => {
  it("starts from the sample, with the page's own origin", () => {
    const { code } = editor("/autocomplete/sessions");

    expect(screen.getByTestId("try-url").textContent).toBe(
      "https://api.baselayer.com/autocomplete/sessions",
    );
    expect(code()).toContain(
      `-d '{"scope": {"routes": {"businesses": ["addresses"]}, "max_limit": 5}}'`,
    );
    expect(code()).toContain('-H "X-API-Key: $BASELAYER_API_KEY"');
    // The browser sends its own Origin: the field says which, and is not typed.
    const origin = screen.getByRole("textbox", { name: "Header Origin" });
    expect((origin as HTMLInputElement).value).toBe(window.location.origin);
    expect((origin as HTMLInputElement).readOnly).toBe(true);
  });

  it("is a flat table: a row for each field the body holds, by its whole path", () => {
    editor("/autocomplete/sessions");

    const rows = screen
      .getAllByRole("rowheader")
      .map(cell => cell.textContent)
      .filter(text => text?.startsWith("scope"));
    expect(rows).toEqual(["scope.routes.businesses", "scope.max_limit"]);
    // A list of relations is chips, each on where the list has it.
    const chips = within(
      screen.getByRole("group", { name: "scope.routes.businesses" }),
    ).getAllByRole("button");
    expect(
      chips.map(chip => [chip.textContent, chip.getAttribute("aria-pressed")]),
    ).toEqual([
      ["businesses", "false"],
      ["people", "false"],
      ["addresses", "true"],
    ]);
  });

  it("follows an edited value and header into the curl", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    const limit = screen.getByRole("spinbutton", { name: "scope.max_limit" });
    await user.clear(limit);
    await user.type(limit, "12");
    expect(code()).toContain('"max_limit": 12');

    const key = screen.getByRole("textbox", { name: "Header X-API-Key" });
    await user.clear(key);
    await user.type(key, "sk_test_example");
    expect(code()).toContain('-H "X-API-Key: sk_test_example"');
  });

  it("adds the fields the schema names from the table's last row, and takes out a field and what it leaves empty", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    const add = within(screen.getByRole("group", { name: "Add a body field" }));
    expect(
      add.getAllByRole("button").map(button => button.textContent),
    ).toEqual(["scope.routes.people", "scope.routes.addresses"]);
    await user.click(add.getByRole("button", { name: "scope.routes.people" }));
    expect(code()).toContain(
      '"routes": {"businesses": ["addresses"], "people": []}',
    );
    await user.click(
      within(
        screen.getByRole("group", { name: "scope.routes.people" }),
      ).getByRole("button", { name: "businesses" }),
    );
    expect(code()).toContain('"people": ["businesses"]');

    await user.click(
      screen.getByRole("button", { name: "Remove scope.max_limit" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove scope.routes.businesses" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Remove scope.routes.people" }),
    );
    // No route left, so no `routes`, and so no `scope`.
    expect(code()).toContain("-d '{}'");
    expect(
      within(screen.getByRole("group", { name: "Add a body field" }))
        .getAllByRole("button")
        .map(button => button.textContent),
    ).toContain("scope.max_limit");
  });

  it("opens the status bar, which says it holds the headers and the body, on the request as it goes out", async () => {
    const { user } = editor("/autocomplete/sessions");
    const bar = screen.getByRole("button", {
      name: /^Request POST \/autocomplete\/sessions .*Show headers and body$/,
    });
    const preview = document.getElementById(
      bar.getAttribute("aria-controls")!,
    )!;

    // Folded, it is out of reach.
    expect(bar.getAttribute("aria-expanded")).toBe("false");
    expect(preview.getAttribute("data-open")).toBe("false");
    expect(preview.hasAttribute("inert")).toBe(true);

    await user.click(bar);
    expect(bar.getAttribute("aria-expanded")).toBe("true");
    expect(bar.textContent).toContain("Hide headers and body");
    expect(preview.getAttribute("data-open")).toBe("true");
    expect(preview.hasAttribute("inert")).toBe(false);
    expect(preview.textContent).toContain(
      "POST /autocomplete/sessions HTTP/1.1",
    );
    expect(preview.textContent).toContain("Host: api.baselayer.com");
    expect(preview.textContent).toContain("(set by your browser)");
    expect(preview.textContent).toContain('"max_limit": 5');
  });
});

describe("Try it here, sent", () => {
  it("sends the request, says how it ended, and hands the answer to the response block", async () => {
    const fetch = answering(201, { session_token: "token", expires_in: 300 });
    const { onResponse, user } = editor("/autocomplete/sessions");

    await user.click(screen.getByRole("button", { name: "Send" }));

    const [target, init] = fetch.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    // In `pnpm site`, through the dev server, as the demo's calls go.
    expect(target).toBe("/_baselayer/autocomplete/sessions");
    expect(init.method).toBe("POST");
    // The browser's own headers are not the page's to send.
    expect(Object.keys(init.headers as object)).toEqual([
      "X-API-Key",
      "Content-Type",
    ]);
    expect(JSON.parse(init.body as string)).toEqual({
      scope: { routes: { businesses: ["addresses"] }, max_limit: 5 },
    });
    const outcome = await screen.findByRole("status");
    expect(outcome.getAttribute("data-ok")).toBe("true");
    expect(outcome.textContent).toContain("201");
    expect(onResponse.mock.lastCall![0]).toMatchObject({
      status: 201,
      json: true,
    });
    expect(JSON.parse(onResponse.mock.lastCall![0].body)).toEqual({
      session_token: "token",
      expires_in: 300,
    });
  });

  it("says a refusal's code and message", async () => {
    answering(401, {
      code: 28,
      message: "Autocomplete session invalid. Mint a new one.",
    });
    const { user } = editor("/autocomplete/people");

    await user.click(screen.getByRole("button", { name: "Send" }));

    const outcome = await screen.findByRole("status");
    expect(outcome.getAttribute("data-ok")).toBe("false");
    expect(outcome.textContent).toContain("401");
    expect(outcome.textContent).toContain(
      "28 · Autocomplete session invalid. Mint a new one.",
    );
  });

  it("says a 422's first complaint", async () => {
    answering(422, {
      detail: [{ loc: ["body", "scope", "max_limit"], msg: "too large" }],
    });
    const { user } = editor("/autocomplete/sessions");

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect((await screen.findByRole("status")).textContent).toContain(
      "body.scope.max_limit: too large",
    );
  });

  it("says a request that never reached the API failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { onResponse, user } = editor("/autocomplete/people");

    await user.click(screen.getByRole("button", { name: "Send" }));

    const outcome = await screen.findByRole("status");
    expect(outcome.getAttribute("data-ok")).toBe("false");
    expect(outcome.textContent).toContain("Failed");
    expect(outcome.textContent).toContain("Did not reach the API");
    expect(onResponse.mock.lastCall![0].status).toBeNull();
  });
});

describe("Try it here, on a search", () => {
  it("edits, adds and removes query parameters, the URL following", async () => {
    const { code, user } = editor("/autocomplete/people");
    const url = () => screen.getByTestId("try-url").textContent;

    expect(url()).toBe(
      "https://api.baselayer.com/autocomplete/people?q=dana%20whit&limit=5",
    );
    const q = screen.getByRole("textbox", {
      name: "Value of query parameter q",
    });
    await user.clear(q);
    await user.type(q, "harbor");
    expect(url()).toContain("?q=harbor&limit=5");

    await user.click(
      screen.getByRole("button", { name: "Add a query parameter" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Name of query parameter 3" }),
      "business.state",
    );
    await user.type(
      screen.getByRole("textbox", {
        name: "Value of query parameter business.state",
      }),
      "PA",
    );
    expect(url()).toContain("&business.state=PA");

    await user.click(
      screen.getByRole("button", { name: "Remove query parameter limit" }),
    );
    expect(url()).toBe(
      "https://api.baselayer.com/autocomplete/people?q=harbor&business.state=PA",
    );
    expect(code()).toContain(`curl -s "${url()}"`);
    // A GET has no body to edit.
    expect(screen.queryByRole("columnheader", { name: "Body" })).toBeNull();
  });
});
