// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurl } from "../../site/api/curl";
import type { JsonSchema } from "../../site/api/spec/assemble";
import { buildReference } from "../../site/api/spec/plugin";
import { TryIt } from "../../site/api/TryIt";

// The page's document, assembled from contracts/ as the build assembles it.
// Under jsdom a module's URL is no file's, so the root is where the run is.
const { document } = buildReference(process.cwd());

afterEach(cleanup);

function editor(path: string) {
  const [method, operation] = Object.entries(document.paths[path]!)[0]!;
  const source = (operation["x-codeSamples"] ?? []).find(
    sample => sample.lang === "shell",
  )!.source;
  const body = (
    operation["requestBody"] as
      { content: Record<string, { schema: JsonSchema }> } | undefined
  )?.content["application/json"]?.schema;
  const onCode = vi.fn<(code: string) => void>();
  render(
    <TryIt
      method={method}
      sample={parseCurl(source)!}
      body={body}
      schemas={document.components?.schemas ?? {}}
      onCode={onCode}
    />,
  );
  const code = () => onCode.mock.lastCall![0];
  return { code, user: userEvent.setup() };
}

describe("Try it here, on the mint", () => {
  it("starts from the sample: the same URL, headers and body", () => {
    const { code } = editor("/autocomplete/sessions");

    expect(screen.getByTestId("try-url").textContent).toBe(
      "https://api.baselayer.com/autocomplete/sessions",
    );
    expect(code()).toContain(
      `-d '{"scope": {"routes": {"businesses": ["addresses"]}, "max_limit": 5}}'`,
    );
    expect(code()).toContain('-H "X-API-Key: $BASELAYER_API_KEY"');
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

  it("adds only the keys the schema names, and removes what may be left out", async () => {
    const { code, user } = editor("/autocomplete/sessions");

    // A route the scope does not name yet, from the schema's choices.
    await user.click(
      screen.getByRole("button", { name: "Add a key to scope.routes" }),
    );
    const choices = screen.getByRole("group", {
      name: "Add a key to scope.routes",
    });
    expect(
      within(choices)
        .getAllByRole("button")
        .map(button => button.textContent),
    ).toEqual(["people", "addresses", "×"]);
    await user.click(within(choices).getByRole("button", { name: "people" }));
    expect(code()).toContain(
      '"routes": {"businesses": ["addresses"], "people": []}',
    );

    // A relation for it, from the relations it does not list yet.
    await user.click(
      screen.getByRole("button", { name: "Add to scope.routes.people" }),
    );
    await user.click(screen.getByRole("button", { name: "businesses" }));
    expect(code()).toContain('"people": ["businesses"]');

    await user.click(
      screen.getByRole("button", { name: "Remove scope.max_limit" }),
    );
    expect(code()).not.toContain("max_limit");

    await user.click(screen.getByRole("button", { name: "Remove scope" }));
    expect(code()).toContain("-d '{}'");
    // Taken out, it is among the keys to add back.
    expect(
      screen.getByRole("button", { name: "Add a key to the body" }),
    ).toBeTruthy();
  });

  it("offers no key a value cannot have", () => {
    editor("/autocomplete/sessions");
    // Every relation is a key's value, never a key of the body itself.
    expect(screen.queryByRole("textbox", { name: "scope" })).toBeNull();
    expect(
      screen
        .queryAllByRole("textbox")
        .map(box => box.getAttribute("aria-label")),
    ).not.toContain("scope.routes");
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
    expect(screen.queryByText("Body")).toBeNull();
  });
});
