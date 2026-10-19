/** @vitest-environment jsdom */

import { LEGAL_RELATIONS } from "@baselayer-sdk/autocomplete";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { fakeApi, useDemoPage } from "./support/demo-page";

// The key step's Session settings on the published page. A visitor sees the
// page as it always was, with no toggle anywhere; a shift-click on the Connect
// step's title reveals the toggle there for the rest of the page's life, and a
// plain click on the title folds and opens the step as it always did. Once
// revealed the toggle is the one the dev server's page has. Run with
// `import.meta.env.DEV` off, as it is in the published build.

useDemoPage();

beforeEach(() => {
  vi.stubEnv("DEV", false);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const GRANT = {
  session_token: "session-token",
  expires_in: 300,
  request_budget: 50,
  pivot_allowance: 5,
  filter_min_stem: 3,
};

/** The API behind the page, with every call kept. */
function stubApi() {
  const spy = vi.fn<typeof fetch>(async input =>
    String(input).includes("/autocomplete/sessions")
      ? new Response(JSON.stringify(GRANT), {
          status: 201,
          headers: { "content-type": "application/json" },
        })
      : fakeApi(input),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

type User = ReturnType<typeof userEvent.setup>;

const step = () => screen.getByTestId("demo-connect");
const heading = () => within(step()).getByRole("heading", { name: /connect/i });
/** The step's own fold: its title, and its summary and chevron too until revealed. */
const stepFold = () =>
  within(heading()).getByRole("button", { name: /connect/i });
const toggle = () => screen.getByTestId("demo-session-toggle");
const noToggle = () => screen.queryByTestId("demo-session-toggle");
const panel = () => document.getElementById("demo-session-settings");
const open = () => stepFold().getAttribute("aria-expanded") === "true";

/** A click with Shift held. */
async function shiftClick(user: User, element: HTMLElement) {
  await user.keyboard("{Shift>}");
  await user.click(element);
  await user.keyboard("{/Shift}");
}

/** The key typed in and applied, and the "Key accepted" shown. */
async function connect(user: User) {
  await user.type(screen.getByTestId("demo-key"), "a-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
}

describe("the published page, before a shift-click on the Connect step's title", () => {
  it("is the page as it always was: no toggle, no panel and none of their words", () => {
    render(<App />);

    expect(noToggle()).toBeNull();
    expect(panel()).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /session settings|match profile|most rows|asked of every session/i,
    );
  });

  it("draws the step's title row as every fold's: the summary and the chevron inside the one button", () => {
    render(<App />);

    expect(heading().children).toHaveLength(1);
    expect(stepFold().querySelector(".fold-chevron")).not.toBeNull();
    expect(stepFold().hasAttribute("aria-describedby")).toBe(false);
  });

  it("folds and opens the step with a plain click, as it always did, and shows nothing", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(stepFold());
    expect(open()).toBe(false);
    expect(noToggle()).toBeNull();
    expect(panel()).toBeNull();
    expect(within(stepFold()).getByText(/not connected/i)).toBeTruthy();

    await user.click(stepFold());
    expect(open()).toBe(true);
    expect(noToggle()).toBeNull();
    expect(panel()).toBeNull();
  });

  it("is not revealed by another modifier: Control, Alt or Meta fold the step as a plain click does", () => {
    render(<App />);

    for (const modifier of ["ctrlKey", "altKey", "metaKey"] as const) {
      fireEvent.click(stepFold(), { [modifier]: true });
      expect(open(), `${modifier} folds`).toBe(false);
      expect(noToggle(), `${modifier} reveals nothing`).toBeNull();
      fireEvent.click(stepFold(), { [modifier]: true });
      expect(open(), `${modifier} opens`).toBe(true);
      expect(noToggle(), `${modifier} reveals nothing`).toBeNull();
    }
  });

  it("is not revealed by Apply, which folds the step, nor by opening it again", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);

    await connect(user);
    expect(open()).toBe(false);
    expect(noToggle()).toBeNull();

    await user.click(stepFold());
    expect(open()).toBe(true);
    expect(noToggle()).toBeNull();
    expect(panel()).toBeNull();
  });

  it("is not revealed by a shift-click anywhere else on the page: the step's fields, step 2's filters", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, screen.getByTestId("demo-key"));
    await shiftClick(user, screen.getByTestId("demo-apply"));
    await shiftClick(
      user,
      screen.getByRole("button", { name: /add filters/i }),
    );

    expect(noToggle()).toBeNull();
    expect(panel()).toBeNull();
  });
});

describe("a shift-click on the Connect step's title", () => {
  it("reveals the toggle right after the title, closed, as the dev server's page has it", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, stepFold());

    expect(toggle().textContent).toBe("+ Session settings");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(
      "demo-session-settings",
    );
    expect(stepFold().nextElementSibling).toBe(toggle());
    expect(panel()?.hidden).toBe(true);
    expect(step().contains(panel())).toBe(true);
  });

  it("leaves an open step open: the toggle comes in view, it is not folded away", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(open()).toBe(true);

    await shiftClick(user, stepFold());

    expect(open()).toBe(true);
    expect(step().getAttribute("data-open")).toBe("true");
  });

  it("opens a folded step with the toggle on its title, rather than revealing it out of sight", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(stepFold());
    expect(open()).toBe(false);

    await shiftClick(user, stepFold());

    expect(open()).toBe(true);
    expect(toggle().textContent).toBe("+ Session settings");
  });

  it("keeps the focus on the title it was pressed on", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, stepFold());

    expect(document.activeElement).toBe(stepFold());
  });

  it("is a plain click once the toggle is revealed: it folds the step, and opens it again", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, stepFold());

    await shiftClick(user, stepFold());
    expect(open()).toBe(false);
    expect(noToggle()).toBeNull();

    await shiftClick(user, stepFold());
    expect(open()).toBe(true);
    expect(toggle()).toBeTruthy();
  });
});

describe("the revealed toggle", () => {
  it("stays for the page's life, on the title while the step is expanded, as on the dev server's page", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, stepFold());

    await user.click(stepFold());
    expect(open()).toBe(false);
    expect(noToggle()).toBeNull();
    await user.click(stepFold());
    expect(open()).toBe(true);
    expect(toggle().textContent).toBe("+ Session settings");

    await connect(user);
    expect(open()).toBe(false);
    expect(noToggle()).toBeNull();
    await user.click(stepFold());
    expect(toggle().textContent).toBe("+ Session settings");
  });

  it("opens the public scope with a plain click, and no match profile", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, stepFold());

    await user.click(toggle());

    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(panel()?.hidden).toBe(false);
    const inside = within(panel()!);
    expect(inside.getByRole("checkbox", { name: /businesses/i })).toBeTruthy();
    expect(inside.getByRole("spinbutton", { name: /most rows/i })).toBeTruthy();
    expect(
      inside.queryByRole("combobox", { name: /match profile/i }),
    ).toBeNull();
    expect(panel()!.textContent).not.toMatch(/profile/i);
  });

  it("opens the advanced field too with its own shift-click, as the dev server's page does", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, stepFold());

    await shiftClick(user, toggle());

    expect(panel()?.hidden).toBe(false);
    expect(
      within(panel()!).getByRole("combobox", { name: /match profile/i }),
    ).toBeTruthy();
  });

  it("offers three profiles and a custom one, and no other", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, stepFold());
    await shiftClick(user, toggle());

    const select = within(panel()!).getByRole("combobox", {
      name: /match profile/i,
    });

    expect(
      [...select.querySelectorAll("option")].map(each => each.value),
    ).toEqual(["", "standard", "reduced", "minimal", "custom"]);
  });
});

describe("a mint from the published page, set through the revealed toggle", () => {
  const ordered = (route: keyof typeof LEGAL_RELATIONS) => [
    ...LEGAL_RELATIONS[route],
  ];

  /** Headers a browser must have the API allow before it sends them. */
  const preflighted = (headers: HeadersInit | undefined) =>
    [...new Headers(headers).keys()]
      .filter(
        name =>
          !["accept", "accept-language", "content-language"].includes(name),
      )
      .sort();

  async function production(user: User) {
    await user.selectOptions(
      screen.getAllByRole("combobox", { name: /environment/i })[0]!,
      "production",
    );
  }

  it("is a POST to the production API with the key and a JSON body, and the preflight asks for those two headers only", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);
    await production(user);
    await shiftClick(user, stepFold());
    await user.click(toggle());
    await user.click(
      within(panel()!).getByRole("checkbox", { name: /people/i }),
    );
    await user.type(
      within(panel()!).getByRole("spinbutton", { name: /most rows/i }),
      "5",
    );
    await connect(user);

    const [url, init] = api.mock.calls.find(([input]) =>
      String(input).includes("/autocomplete/sessions"),
    )!;
    expect(url).toBe("https://api.baselayer.com/autocomplete/sessions");
    expect(init).toEqual({
      method: "POST",
      headers: {
        Accept: "application/json",
        "X-API-Key": "a-key",
        "Content-Type": "application/json",
      },
      body: expect.any(String),
      credentials: "omit",
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init!.body as string)).toEqual({
      scope: { routes: { people: ordered("people") }, max_limit: 5 },
    });
    // The API's preflight allows Content-Type beside the key's header; a
    // header added to the mint fails this, to be looked at.
    expect(preflighted(init!.headers)).toEqual(["content-type", "x-api-key"]);
  });

  it("is the bodyless request it always was, the preflight asking for the key only, when nothing is set", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);
    await production(user);
    await shiftClick(user, stepFold());
    await user.click(toggle());
    await connect(user);

    const [url, init] = api.mock.calls.find(([input]) =>
      String(input).includes("/autocomplete/sessions"),
    )!;
    expect(url).toBe("https://api.baselayer.com/autocomplete/sessions");
    expect("body" in init!).toBe(false);
    expect(preflighted(init!.headers)).toEqual(["x-api-key"]);
  });
});
