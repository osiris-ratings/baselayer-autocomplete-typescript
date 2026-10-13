// @vitest-environment jsdom

import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { parseCurl } from "../../site/api/curl";
import {
  clock,
  SessionCountdown,
  SessionProvider,
  sessionFrom,
  type ActiveSession,
} from "../../site/api/session";
import type { JsonSchema } from "../../site/api/spec/assemble";
import { buildReference } from "../../site/api/spec/plugin";
import { TryIt, type LiveResponse } from "../../site/api/TryIt";
import { Code } from "../../site/shared/Code";

// The page's document, assembled from contracts/ as the build assembles it.
const { document: reference } = buildReference(process.cwd());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** One operation's form, as the reference draws it. */
function form(
  path: string,
  onCode = vi.fn(),
  onResponse: (response: LiveResponse) => void = () => {},
) {
  const [method, operation] = Object.entries(reference.paths[path]!)[0]!;
  const source = (operation["x-codeSamples"] ?? []).find(
    sample => sample.lang === "shell",
  )!.source;
  const body = (
    operation["requestBody"] as
      { content: Record<string, { schema: JsonSchema }> } | undefined
  )?.content["application/json"]?.schema;
  return (
    <section aria-label={path}>
      <TryIt
        method={method}
        sample={parseCurl(source)!}
        body={body}
        labels={["curl"]}
        parameters={(operation.parameters ?? [])
          .filter(parameter => parameter.in === "query")
          .map(parameter => parameter.name)}
        required={(operation.parameters ?? [])
          .filter(parameter => parameter.required === true)
          .map(parameter => parameter.name)}
        schemas={reference.components?.schemas ?? {}}
        onCode={onCode}
        onResponse={onResponse}
      />
    </section>
  );
}

const MINT = {
  url: "https://api.baselayer.com/autocomplete/sessions",
  headers: {
    "X-API-Key": "sk_test_made_up",
    "Content-Type": "application/json",
  },
  body: {},
};

const session = (over: Partial<ActiveSession> = {}): ActiveSession => ({
  token: "tok-active",
  expiresAt: Date.now() + 125_000,
  mint: MINT,
  ...over,
});

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const field = (within_: HTMLElement) =>
  within(within_).getByRole("textbox", {
    name: "Header X-Autocomplete-Session",
  }) as HTMLInputElement;

describe("the session the reference's forms share", () => {
  it("says there is none, and where to make one, before a Create a session", () => {
    render(<SessionProvider>{form("/autocomplete/people")}</SessionProvider>);

    const people = screen.getByRole("region", { name: "/autocomplete/people" });
    expect(field(people).value).toBe("$SESSION");
    expect(people.textContent).toContain("No session yet.");
    expect(
      within(people)
        .getByRole("link", { name: "Create a session" })
        .getAttribute("href"),
    ).toBe("#create-a-session");
  });

  it("starts the autocomplete forms from the session a Create a session made, and says how long it has", async () => {
    const onCode = vi.fn<(codes: Readonly<Record<string, string>>) => void>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        reply(201, { session_token: "tok-minted", expires_in: 300 }),
      ),
    );
    const user = userEvent.setup();
    render(
      <SessionProvider>
        {form("/autocomplete/sessions")}
        {form("/autocomplete/people", onCode)}
      </SessionProvider>,
    );
    const mint = screen.getByRole("region", { name: "/autocomplete/sessions" });
    const people = screen.getByRole("region", { name: "/autocomplete/people" });

    await user.click(within(mint).getByRole("button", { name: "Send" }));

    await waitFor(() => expect(field(people).value).toBe("tok-minted"));
    expect(people.textContent).toContain("Active");
    // From `expires_in`, counted down: five minutes less a moment.
    expect(people.textContent).toMatch(/expires in (5:00|4:5\d)/);
    expect(people.textContent).toContain("Send mints a new one if it expires");
    // The samples say the token, so what is copied runs.
    expect(onCode.mock.lastCall![0].curl).toContain(
      '-H "X-Autocomplete-Session: tok-minted"',
    );
  });

  it("sends the active session, and does not mint while it has time", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { suggestions: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session()}>
        {form("/autocomplete/people")}
      </SessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await screen.findByRole("status");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [target, init] = fetchImpl.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(target).toContain("/autocomplete/people");
    expect(
      (init.headers as Record<string, string>)["X-Autocomplete-Session"],
    ).toBe("tok-active");
  });

  it("mints a new session first, on Send, once it has expired, with the request that made it", async () => {
    const fetchImpl = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        reply(201, { session_token: "tok-new", expires_in: 300 }),
      )
      .mockResolvedValueOnce(reply(200, { suggestions: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session({ expiresAt: Date.now() - 1000 })}>
        {form("/autocomplete/people")}
      </SessionProvider>,
    );
    const people = screen.getByRole("region", { name: "/autocomplete/people" });
    expect(people.textContent).toContain("Expired");

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2));
    const [mintUrl, mintInit] = fetchImpl.mock.calls[0]!;
    expect(mintUrl).toBe("/_baselayer/autocomplete/sessions");
    expect(mintInit.method).toBe("POST");
    expect((mintInit.headers as Record<string, string>)["X-API-Key"]).toBe(
      "sk_test_made_up",
    );
    const [, searchInit] = fetchImpl.mock.calls[1]!;
    expect(
      (searchInit.headers as Record<string, string>)["X-Autocomplete-Session"],
    ).toBe("tok-new");
    // The field and the bar say so.
    await waitFor(() => expect(field(people).value).toBe("tok-new"));
    expect(people.textContent).toContain("Active");
    expect((await screen.findByRole("status")).textContent).toContain(
      "new session minted",
    );
  });

  it("says so, and sends nothing, when minting again fails", async () => {
    const fetchImpl = vi.fn(async () =>
      reply(401, {
        code: 24,
        message: "The given X-API-Key is not recognized.",
      }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session({ expiresAt: Date.now() - 1000 })}>
        {form("/autocomplete/people")}
      </SessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    const outcome = await screen.findByRole("status");
    expect(outcome.getAttribute("data-ok")).toBe("false");
    expect(outcome.textContent).toContain(
      "The session had expired, and minting a new one failed: 24 · The given X-API-Key is not recognized.",
    );
    // Only the mint went out.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("sends a Create a session as it stands, with no mint before it, though the session held has expired", async () => {
    const fetchImpl = vi.fn(async () =>
      reply(201, { session_token: "tok-own", expires_in: 300 }),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session({ expiresAt: Date.now() - 1000 })}>
        {form("/autocomplete/sessions")}
        {form("/autocomplete/people")}
      </SessionProvider>,
    );
    const mint = screen.getByRole("region", { name: "/autocomplete/sessions" });
    const people = screen.getByRole("region", { name: "/autocomplete/people" });

    await user.click(within(mint).getByRole("button", { name: "Send" }));

    // The form's own request is the only one: nothing is minted ahead of it,
    // since it takes no session, and it does not hang on one that has run out.
    const outcome = await within(mint).findByRole("status");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(outcome.textContent).not.toContain("new session minted");
    await waitFor(() => expect(field(people).value).toBe("tok-own"));
  });

  it("leaves a value the reader typed alone, and offers the active session back", async () => {
    const fetchImpl = vi.fn(async () => reply(200, { suggestions: [] }));
    vi.stubGlobal("fetch", fetchImpl);
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session({ expiresAt: Date.now() - 1000 })}>
        {form("/autocomplete/people")}
      </SessionProvider>,
    );
    const people = screen.getByRole("region", { name: "/autocomplete/people" });

    await user.clear(field(people));
    await user.type(field(people), "my-own-token");
    expect(people.textContent).toContain(
      "Your own value, not the active session.",
    );

    // Expired or not, a value of the reader's own is sent as it is, no mint.
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByRole("status");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [
      string,
      RequestInit,
    ];
    expect(
      (init.headers as Record<string, string>)["X-Autocomplete-Session"],
    ).toBe("my-own-token");

    await user.click(
      within(people).getByRole("button", { name: "Use the active session" }),
    );
    expect(field(people).value).toBe("tok-active");
  });

  it("is on the routes that take a session, and not on the mint", () => {
    render(
      <SessionProvider initial={session()}>
        {form("/autocomplete/sessions")}
      </SessionProvider>,
    );
    expect(document.querySelector(".try-session")).toBeNull();
  });
});

describe("a session from a mint's answer", () => {
  it("counts its expiry from expires_in, which the API says to time from", () => {
    const made = sessionFrom(
      {
        session_token: "t",
        expires_in: 180,
        expires_at: "1999-01-01T00:00:00Z",
      },
      MINT,
      1_000_000,
    );
    expect(made).toEqual({ token: "t", expiresAt: 1_180_000, mint: MINT });
  });

  it("is none for an answer without a token", () => {
    expect(sessionFrom({ expires_in: 180 }, MINT, 0)).toBeNull();
    expect(sessionFrom(null, MINT, 0)).toBeNull();
  });

  it("writes what is left as minutes and seconds, rounded up", () => {
    expect(clock(125_000)).toBe("2:05");
    expect(clock(59_001)).toBe("1:00");
    expect(clock(-5)).toBe("0:00");
  });
});

describe("the countdown beside a minted session's answer", () => {
  it("counts down to the second, then says expired", () => {
    const { rerender } = render(
      <SessionCountdown expiresAt={Date.now() + 118_500} />,
    );
    expect(
      screen.getByText(/session expires in 1:5\d|session expires in 2:00/),
    ).toBeTruthy();

    rerender(<SessionCountdown expiresAt={Date.now() - 1000} />);
    expect(screen.getByText("session expired")).toBeTruthy();
  });

  it("is handed to the response block by a mint that gave a session, from expires_in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(201, { session_token: "tok", expires_in: 120 })),
    );
    const onResponse = vi.fn<(response: LiveResponse) => void>();
    const user = userEvent.setup();
    const before = Date.now();
    render(
      <SessionProvider>
        {form("/autocomplete/sessions", vi.fn(), onResponse)}
      </SessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onResponse).toHaveBeenCalled());
    const { expiresAt } = onResponse.mock.lastCall![0];
    expect(expiresAt).toBeGreaterThanOrEqual(before + 120_000);
    expect(expiresAt).toBeLessThan(Date.now() + 120_000 + 1);
  });

  it("is not on an answer that is no session, a refusal or a search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { suggestions: [] })),
    );
    const onResponse = vi.fn<(response: LiveResponse) => void>();
    const user = userEvent.setup();
    render(
      <SessionProvider initial={session()}>
        {form("/autocomplete/people", vi.fn(), onResponse)}
      </SessionProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(onResponse).toHaveBeenCalled());
    expect(onResponse.mock.lastCall![0].expiresAt).toBeUndefined();
  });

  it("shows in the response block beside Copy while the live tab is up, and not on another tab", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Code
        title="Response"
        snippets={[{ label: "201", lang: "json", code: "{}" }]}
        live={{
          key: 1,
          label: "Live · 201",
          lang: "json",
          code: "{}",
          note: <SessionCountdown expiresAt={Date.now() + 90_000} />,
        }}
      />,
    );
    // A live answer is shown as it arrives.
    expect(container.querySelector(".code-note")?.textContent).toContain(
      "session expires in",
    );

    await user.click(screen.getByRole("tab", { name: "201" }));
    expect(container.querySelector(".code-note")).toBeNull();
  });
});
