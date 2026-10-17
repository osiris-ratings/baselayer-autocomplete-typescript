/** @vitest-environment jsdom */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { DEMO_KEY_PATH, readPrefilledKey } from "../../site/demo/prefill";
import { fakeApi, useDemoPage } from "./support/demo-page";

// DEV ONLY: a dev server started with DEMO_API_KEY_FILE or DEMO_API_KEY hands
// the page its key (site/demo-key.ts), which fills the field and is applied as
// if it had been typed and Apply pressed.

useDemoPage();
beforeEach(() => {
  // What the dev server defines when it holds a key.
  vi.stubGlobal("__DEMO_PREFILL__", true);
});

const KEY = "prefilled-key-8c41";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The dev server's answer at the key's path, and the fake API behind the rest.
 * It gives up after a few asks: a page that asks again on every render would
 * otherwise loop on promises alone, and no test timeout can stop that. Past the
 * few, the test fails on the count.
 */
function devServer(
  answer: () => Response | Promise<Response>,
  api: (input: RequestInfo | URL) => Response | Promise<Response> = fakeApi,
) {
  let asks = 0;
  const calls = vi.fn<typeof fetch>(async input =>
    String(input) === DEMO_KEY_PATH
      ? ++asks > 5
        ? json(404, {})
        : answer()
      : api(input),
  );
  vi.stubGlobal("fetch", calls);
  return calls;
}

const asked = (calls: ReturnType<typeof devServer>) =>
  calls.mock.calls.filter(([input]) => String(input) === DEMO_KEY_PATH);
const mints = (calls: ReturnType<typeof devServer>) =>
  calls.mock.calls.filter(([input]) =>
    String(input).includes("/autocomplete/sessions"),
  );

describe("the dev server's key, prefilled in the demo", () => {
  it("fills the key field and applies it once, with the page mounted as the site mounts it", async () => {
    const calls = devServer(() => json(200, { key: KEY }));

    render(
      <StrictMode>
        <App />
      </StrictMode>,
    );

    await screen.findByText(/key accepted/i);
    expect((screen.getByTestId("demo-key") as HTMLInputElement).value).toBe(
      KEY,
    );
    expect(screen.getByTestId("demo-apply").textContent).toBe("Applied");
    // StrictMode runs an effect twice: the page still asks once and mints once.
    expect(asked(calls)).toHaveLength(1);
    expect(mints(calls)).toHaveLength(1);
  });

  it("applies it as the key the API is sent", async () => {
    const calls = devServer(() => json(200, { key: KEY }));

    render(<App />);
    await screen.findByText(/key accepted/i);

    const [, init] = mints(calls)[0]!;
    expect(new Headers(init?.headers).get("x-api-key")).toBe(KEY);
  });

  it("does not ask the dev server when it was not told to, as in a build", async () => {
    const calls = devServer(() => json(200, { key: KEY }));
    vi.stubGlobal("__DEMO_PREFILL__", false);

    render(<App />);
    await waitFor(() => expect(screen.getByTestId("demo-key")).toBeTruthy());
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(asked(calls)).toHaveLength(0);
    expect(mints(calls)).toHaveLength(0);
    expect((screen.getByTestId("demo-key") as HTMLInputElement).value).toBe("");
  });

  it("leaves the field empty and says nothing when the server has no key", async () => {
    const calls = devServer(() => json(404, {}));

    render(<App />);
    await waitFor(() => expect(asked(calls)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect((screen.getByTestId("demo-key") as HTMLInputElement).value).toBe("");
    expect(mints(calls)).toHaveLength(0);
    expect(screen.queryByText(/key accepted/i)).toBeNull();
    expect(document.querySelector(".check")).toBeNull();
  });

  it("leaves the field empty when the ask fails", async () => {
    const calls = devServer(() => Promise.reject(new TypeError("offline")));

    render(<App />);
    await waitFor(() => expect(asked(calls)).toHaveLength(1));
    await new Promise(resolve => setTimeout(resolve, 20));

    expect((screen.getByTestId("demo-key") as HTMLInputElement).value).toBe("");
    expect(mints(calls)).toHaveLength(0);
  });

  it("shows the API's refusal of the key, with the key left in the field to fix", async () => {
    devServer(
      () => json(200, { key: KEY }),
      () => json(401, { code: 401, message: "No", uri: null, metadata: {} }),
    );

    render(<App />);

    await screen.findByText("The API does not recognize this key.");
    expect((screen.getByTestId("demo-key") as HTMLInputElement).value).toBe(
      KEY,
    );
    expect(screen.queryByText(/key accepted/i)).toBeNull();
  });

  it("keeps the key out of the network log: the ask is not a request the log records, and no row holds the key", async () => {
    devServer(() => json(200, { key: KEY }));
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/key accepted/i);
    await user.click(screen.getByTestId("demo-debug-open"));
    await user.click(screen.getByTestId("demo-debug-tab-network"));
    const log = await screen.findByTestId("demo-network");
    // Every row opened, its headers and bodies on show. The log redacts the
    // API key header and the token fields, not a `key` in a body.
    for (const row of log.querySelectorAll<HTMLElement>("button.net-row")) {
      await user.click(row);
    }

    // The control: the log is on screen and holds the one request the page
    // made on its own account, the mint that tested the key.
    expect(log.textContent).toMatch(/\b1 requests · 1 mint\b/);
    expect(log.textContent).toContain("/autocomplete/sessions");
    expect(log.textContent).not.toContain("__demo");
    expect(log.textContent).not.toContain(KEY);
    // Nor anywhere else on the page: the key sits in its field only.
    expect(document.body.textContent).not.toContain(KEY);
  });

  it("does not take the key as focus: nothing on the page is pulled to the Connect toggle on load", async () => {
    devServer(() => json(200, { key: KEY }));

    render(<App />);
    await screen.findByText(/key accepted/i);

    expect(document.activeElement).toBe(document.body);
  });
});

describe("asking the dev server for the key", () => {
  const answerWith = (response: Response | Error) =>
    vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    }) as unknown as typeof fetch;

  it("reads the key from the JSON answer, trimmed", async () => {
    expect(
      await readPrefilledKey(answerWith(json(200, { key: `  ${KEY} ` }))),
    ).toBe(KEY);
  });

  it("asks at the path, never cached, and for the page's own origin only", async () => {
    const fetchImpl = answerWith(json(200, { key: KEY }));

    await readPrefilledKey(fetchImpl);

    expect(fetchImpl).toHaveBeenCalledWith(DEMO_KEY_PATH, {
      cache: "no-store",
      credentials: "same-origin",
    });
  });

  it.each([
    ["a refusal", json(404, { key: KEY })],
    ["no key", json(200, {})],
    ["an empty key", json(200, { key: "  " })],
    ["a key that is not text", json(200, { key: 12 })],
    ["a body that is not JSON", new Response("<html>", { status: 200 })],
    ["a failed request", new TypeError("offline")],
  ])("has no key from %s", async (_, response) => {
    expect(await readPrefilledKey(answerWith(response))).toBeNull();
  });
});
