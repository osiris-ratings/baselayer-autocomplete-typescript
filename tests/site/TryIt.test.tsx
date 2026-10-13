// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurl } from "../../site/api/curl";
import { Code } from "../../site/shared/Code";
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
  const onCode = vi.fn<(codes: Readonly<Record<string, string>>) => void>();
  const onResponse = vi.fn<(response: LiveResponse) => void>();
  render(
    <TryIt
      method={method}
      sample={parseCurl(source)!}
      body={body}
      labels={(operation["x-codeSamples"] ?? []).map(
        sample => sample.label ?? sample.lang,
      )}
      required={[
        ...(path === "/autocomplete/sessions" ? ["X-API-Key"] : []),
        ...(operation.parameters ?? [])
          .filter(parameter => parameter.required === true)
          .map(parameter => parameter.name),
      ]}
      parameters={(operation.parameters ?? [])
        .filter(parameter => parameter.in === "query")
        .map(parameter => parameter.name)}
      schemas={reference.components?.schemas ?? {}}
      onCode={onCode}
      onResponse={onResponse}
    />,
  );
  const code = () => onCode.mock.lastCall![0].curl!;
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

/** A body field added from the table's last row, as a reader adds it. */
async function addField(
  user: ReturnType<typeof userEvent.setup>,
  path: string,
) {
  await user.click(
    within(screen.getByRole("group", { name: "Add a body field" })).getByRole(
      "button",
      { name: path },
    ),
  );
}

const offered = () =>
  within(screen.getByRole("group", { name: "Add a body field" }))
    .getAllByRole("button")
    .map(button => button.textContent);

describe("Try it here, on the mint", () => {
  it("starts with no scope, which reaches everything, and says so, with the page's own origin", () => {
    const { code } = editor("/autocomplete/sessions");

    expect(screen.getByTestId("try-url").textContent).toBe(
      "https://api.baselayer.com/autocomplete/sessions",
    );
    // Left out, the scope narrows nothing: every route, every relation.
    expect(code()).toContain("-d '{}'");
    expect(
      screen.getByRole("row", { name: /No route listed/ }).textContent,
    ).toContain("every route your organization may, with every relation");
    expect(offered()).toEqual([
      "scope.routes.businesses",
      "scope.routes.people",
      "scope.routes.addresses",
      "scope.max_limit",
    ]);
    expect(code()).toContain('-H "X-API-Key: $BASELAYER_API_KEY"');
    // The browser sends its own Origin: the field says which, and is not typed.
    const origin = screen.getByRole("textbox", { name: "Header Origin" });
    expect((origin as HTMLInputElement).value).toBe(window.location.origin);
    expect((origin as HTMLInputElement).readOnly).toBe(true);
    // Nor is the body's type.
    expect(
      (
        screen.getByRole("textbox", {
          name: "Header Content-Type",
        }) as HTMLInputElement
      ).readOnly,
    ).toBe(true);
    // What the operation requires says so; what is filled in already does not.
    const names = screen
      .getAllByRole("rowheader")
      .map(cell => cell.textContent);
    // The fixed ones first, so the one to fill in sits by the body's fields.
    expect(names.slice(0, 3)).toEqual([
      "Content-Type",
      "Origin",
      "X-API-Key* (required)",
    ]);
  });

  it("is a flat table: a row for each field added, by its whole path, a route with every relation it carries", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    await addField(user, "scope.routes.businesses");
    await addField(user, "scope.max_limit");

    const rows = screen
      .getAllByRole("rowheader")
      .map(cell => cell.textContent)
      .filter(text => text?.startsWith("scope"));
    expect(rows).toEqual(["scope.routes.businesses", "scope.max_limit"]);
    // A list of relations is chips, each on where the list has it; a route
    // lists only the relations it carries, never itself.
    expect(
      within(screen.getByRole("group", { name: "scope.routes.businesses" }))
        .getAllByRole("button")
        .map(chip => [chip.textContent, chip.getAttribute("aria-pressed")]),
    ).toEqual([
      ["people", "true"],
      ["addresses", "true"],
    ]);
    // A number starts at its example.
    expect(code()).toContain(
      `-d '{"scope": {"routes": {"businesses": ["people", "addresses"]}, "max_limit": 5}}'`,
    );
    expect(screen.queryByRole("row", { name: /No route listed/ })).toBeNull();
  });

  it("follows an edited value and header into the curl", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    await addField(user, "scope.max_limit");
    const limit = screen.getByRole("spinbutton", { name: "scope.max_limit" });
    await user.clear(limit);
    await user.type(limit, "12");
    expect(code()).toContain('"max_limit": 12');

    const key = screen.getByRole("textbox", { name: "Header X-API-Key" });
    await user.clear(key);
    await user.type(key, "sk_test_example");
    expect(code()).toContain('-H "X-API-Key: sk_test_example"');
  });

  it("switches a route's relations, and takes out a field and what it leaves empty", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    await addField(user, "scope.routes.people");
    expect(code()).toContain('"people": ["businesses", "addresses"]');

    // A route with nothing on still searches, with nothing related.
    const people = within(
      screen.getByRole("group", { name: "scope.routes.people" }),
    );
    await user.click(people.getByRole("button", { name: "businesses" }));
    await user.click(people.getByRole("button", { name: "addresses" }));
    expect(code()).toContain('"people": []');
    expect(
      screen.getByRole("group", { name: "scope.routes.people" }).parentElement!
        .textContent,
    ).toContain("none on: searches it, with nothing related");
    await user.click(people.getByRole("button", { name: "businesses" }));
    expect(code()).toContain('"people": ["businesses"]');

    // The last route out takes `routes` and then `scope` with it.
    await user.click(
      screen.getByRole("button", { name: "Remove scope.routes.people" }),
    );
    expect(code()).toContain("-d '{}'");
    expect(offered()).toContain("scope.routes.people");
  });

  it("opens the status bar, which says it holds the headers and the body, on the request as it goes out", async () => {
    const { user } = editor("/autocomplete/sessions");
    await addField(user, "scope.max_limit");
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
    // No scope: everything the key may search.
    expect(JSON.parse(init.body as string)).toEqual({});
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
  it("takes a parameter's value, adds the parameters the route names, and takes one out, the URL following", async () => {
    const { code, user } = editor("/autocomplete/people");
    const url = () => screen.getByTestId("try-url").textContent;

    expect(url()).toBe(
      "https://api.baselayer.com/autocomplete/people?q=dana%20whit&limit=5",
    );
    // `q` is required, so it says so, and stays.
    expect(
      screen.queryByRole("button", { name: "Remove query parameter q" }),
    ).toBeNull();
    // A parameter's name is the route's, never typed.
    expect(
      screen.queryByRole("textbox", { name: /Name of query parameter/ }),
    ).toBeNull();
    const q = screen.getByRole("textbox", {
      name: "Value of query parameter q",
    });
    await user.clear(q);
    await user.type(q, "harbor");
    // The URL box shows it once the typing rests.
    await waitFor(() => expect(url()).toContain("?q=harbor&limit=5"));

    const add = within(
      screen.getByRole("group", { name: "Add a query parameter" }),
    );
    expect(
      add.getAllByRole("button").map(button => button.textContent),
    ).toEqual(["include", "business.state", "business.name", "address.text"]);
    await user.click(add.getByRole("button", { name: "business.state" }));
    await user.type(
      screen.getByRole("textbox", {
        name: "Value of query parameter business.state",
      }),
      "PA",
    );
    await waitFor(() => expect(url()).toContain("&business.state=PA"));

    await user.click(
      screen.getByRole("button", { name: "Remove query parameter limit" }),
    );
    await waitFor(() =>
      expect(url()).toBe(
        "https://api.baselayer.com/autocomplete/people?q=harbor&business.state=PA",
      ),
    );
    expect(code()).toContain(`curl -s "${url()}"`);
    // Taken out, it is offered again.
    expect(
      within(screen.getByRole("group", { name: "Add a query parameter" }))
        .getAllByRole("button")
        .map(button => button.textContent),
    ).toContain("limit");
    // A GET has no body to edit.
    expect(screen.queryByRole("columnheader", { name: "Body" })).toBeNull();
  });
});

describe("the curl sample, beside Try it here", () => {
  it("shows the request the form would send, as it is edited", async () => {
    const [method, operation] = Object.entries(
      reference.paths["/autocomplete/sessions"]!,
    )[0]!;
    const source = (operation["x-codeSamples"] ?? []).find(
      sample => sample.lang === "shell",
    )!.source;
    const body = (
      operation["requestBody"] as {
        content: Record<string, { schema: JsonSchema }>;
      }
    ).content["application/json"]!.schema;
    const user = userEvent.setup();
    render(
      <Code
        title="Request"
        snippets={[{ label: "curl", lang: "shell", code: source }]}
        tool={{
          label: "Try it here",
          copies: "curl",
          render: onCode => (
            <TryIt
              method={method}
              sample={parseCurl(source)!}
              body={body}
              labels={["curl"]}
              required={[]}
              parameters={[]}
              schemas={reference.components?.schemas ?? {}}
              onCode={onCode}
              onResponse={() => {}}
            />
          ),
        }}
      />,
    );
    const curlTab = () =>
      document.getElementById(
        screen
          .getByRole("tab", { name: "curl" })
          .getAttribute("aria-controls")!,
      )!.textContent;

    await user.click(screen.getByRole("tab", { name: "Try it here" }));
    await addField(user, "scope.max_limit");
    const limit = screen.getByRole("spinbutton", { name: "scope.max_limit" });
    await user.clear(limit);
    await user.type(limit, "9");
    await user.click(screen.getByRole("tab", { name: "curl" }));

    expect(curlTab()).toContain('"max_limit": 9');
    expect(curlTab()).not.toContain('"max_limit": 5');
  });
});

describe("Try it here, under StrictMode", () => {
  it("numbers its query rows the same however often an initializer runs, so no two share a key", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    render(
      <StrictMode>
        <TryIt
          method="get"
          sample={parseCurl(
            'curl -s "https://api.baselayer.com/autocomplete/people?q=dana&limit=5" -H "X-Autocomplete-Session: $SESSION"',
          )!}
          body={undefined}
          parameters={["q", "limit", "include", "business.state"]}
          labels={["curl"]}
          required={["q"]}
          schemas={{}}
          onCode={() => {}}
          onResponse={() => {}}
        />
      </StrictMode>,
    );
    await user.click(screen.getByRole("button", { name: "include" }));
    await user.click(screen.getByRole("button", { name: "business.state" }));

    expect(
      screen
        .getAllByRole("textbox", { name: /^Value of query parameter/ })
        .map(box => box.getAttribute("aria-label")),
    ).toEqual([
      "Value of query parameter q",
      "Value of query parameter limit",
      "Value of query parameter include",
      "Value of query parameter business.state",
    ]);
    // React says so, on the console, of two children with one key.
    expect(
      error.mock.calls.filter(call => String(call[0]).includes("same key")),
    ).toEqual([]);
    error.mockRestore();
  });
});
