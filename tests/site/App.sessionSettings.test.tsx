/** @vitest-environment jsdom */

import { LEGAL_RELATIONS } from "@baselayer-sdk/autocomplete";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { App } from "../../site/demo/App";
import { fakeApi, nameField, useDemoPage } from "./support/demo-page";

// The key step's "Session" fold: a closed toggle on the step's title that,
// opened, sets what the demo asks of every session it mints. A plain click
// opens the public scope (the routes the session may query, the most rows a
// request may ask for); a shift-click opens it with the match profile too,
// which is not in the API's published contract. All of it goes in the mint's
// body as `scope`, only what is set, and nothing set is no body at all.

useDemoPage();

const GRANT = {
  session_token: "session-token",
  expires_in: 300,
  request_budget: 50,
  pivot_allowance: 5,
  filter_min_stem: 3,
};

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The API behind the page, with every call kept. `grant` overrides the
 * session it mints; `refuse` may answer a mint itself. A grant with ten seconds
 * or fewer left is not worth handing over, so with `expires_in: 8` the page's
 * own client has to mint for itself once it searches: a later mint.
 */
function stubApi({
  grant = {},
  refuse,
}: {
  grant?: Record<string, unknown>;
  refuse?: (init: RequestInit | undefined) => Response | undefined;
} = {}) {
  const spy = vi.fn<typeof fetch>(async (input, init) => {
    if (String(input).includes("/autocomplete/sessions")) {
      return refuse?.(init) ?? reply(201, { ...GRANT, ...grant });
    }
    return fakeApi(input);
  });
  vi.stubGlobal("fetch", spy);
  return spy;
}

type Api = ReturnType<typeof stubApi>;

const mints = (api: Api) =>
  api.mock.calls.filter(([input]) =>
    String(input).includes("/autocomplete/sessions"),
  );
const bodyOf = (call: Api["mock"]["calls"][number]) => call[1]?.body;
const contentTypeOf = (call: Api["mock"]["calls"][number]) =>
  new Headers(call[1]?.headers).get("content-type");

const toggle = () => screen.getByTestId("demo-session-toggle");

/** A click with Shift held, which reveals the match profile. */
async function shiftClick(
  user: ReturnType<typeof userEvent.setup>,
  element: HTMLElement,
) {
  await user.keyboard("{Shift>}");
  await user.click(element);
  await user.keyboard("{/Shift}");
}

const routeBox = (name: RegExp) =>
  within(panel()).getByRole("checkbox", { name });
const rowsField = () =>
  within(panel()).getByRole("spinbutton", { name: /most rows/i });
const noProfileField = () => {
  expect(screen.queryByRole("combobox", { name: /match profile/i })).toBeNull();
  expect(screen.queryByRole("textbox", { name: /custom profile/i })).toBeNull();
  expect(panel().textContent).not.toMatch(/profile/i);
};
const panel = () => document.getElementById("demo-session-settings")!;
const step = () => screen.getByTestId("demo-connect");
const profileSelect = () =>
  screen.getByRole("combobox", { name: /match profile/i });

/** The key typed in and applied, and the "Key accepted" shown. */
async function connect(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByTestId("demo-key"), "a-key");
  await user.click(screen.getByTestId("demo-apply"));
  await screen.findByText(/key accepted/i);
}

describe("the Session fold, as the page opens", () => {
  it("is one closed row, and the settings are out of reach", () => {
    render(<App />);

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().getAttribute("aria-controls")).toBe(
      "demo-session-settings",
    );
    expect(toggle().textContent).toBe("+ Session settings");
    expect(panel().hidden).toBe(true);
    // Hidden, so nothing in it takes focus or is read out.
    expect(
      screen.queryByRole("combobox", { name: /match profile/i }),
    ).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /businesses/i })).toBeNull();
  });

  it("sits in the key step's title row, beside its fold, as step 2's filters row sits in its title", () => {
    render(<App />);

    const heading = within(screen.getByTestId("demo-connect")).getByRole(
      "heading",
      { name: /connect/i },
    );
    const fold = within(heading).getByRole("button", { name: /connect/i });

    expect(heading.contains(toggle())).toBe(true);
    // Beside the step's own toggle, not inside it: a button holds no buttons.
    expect(fold.contains(toggle())).toBe(false);
    expect(toggle().parentElement?.closest("button")).toBeNull();
    // The step's own chevron and summary are at the row's end, after it.
    const chevron = [...heading.querySelectorAll(".fold-chevron")].find(
      each => !toggle().contains(each),
    )!;
    expect(
      toggle().compareDocumentPosition(chevron) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // The title comes before the step's fields, so the row does too.
    expect(
      toggle().compareDocumentPosition(screen.getByTestId("demo-key")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("leaves nothing under Apply: the row and its panel come before the key", () => {
    render(<App />);

    const apply = screen.getByTestId("demo-apply");

    expect(
      apply.compareDocumentPosition(toggle()) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
    expect(
      apply.compareDocumentPosition(panel()) & Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("holds the panel under the title row, before the step's own fields", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    const environment = screen.getAllByRole("combobox", {
      name: /environment/i,
    })[0]!;

    expect(
      panel().compareDocumentPosition(environment) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      panel().compareDocumentPosition(screen.getByTestId("demo-key")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByTestId("demo-connect").contains(panel())).toBe(true);
  });

  it("opens and closes on its row", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect(profileSelect()).toBeTruthy();

    await user.click(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
  });

  it("offers standard, reduced and minimal, set to none", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());

    const options = within(profileSelect()).getAllByRole("option");

    expect(options.map(option => option.textContent)).toEqual([
      "Not set",
      "standard",
      "reduced",
      "minimal",
      "Custom…",
    ]);
    expect((profileSelect() as HTMLSelectElement).value).toBe("");
    // No text field until the page is told it will be typed in.
    expect(
      screen.queryByRole("textbox", { name: /custom profile/i }),
    ).toBeNull();
  });
});

describe("the row on the title, once the key step has folded", () => {
  it("stays on the title and names the profile, as the filters' row names its count", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "reduced");
    await connect(user);

    expect(step().getAttribute("data-open")).toBe("false");
    expect(toggle().textContent).toBe("Session · reduced");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the step and its panel when it is pressed, the profile still chosen", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "minimal");
    await connect(user);
    expect(step().getAttribute("data-open")).toBe("false");

    await user.click(toggle());

    expect(step().getAttribute("data-open")).toBe("true");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect((profileSelect() as HTMLSelectElement).value).toBe("minimal");
  });

  it("opens the step and its panel when nothing was ever set, too", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(step().getAttribute("data-open")).toBe("false");
    expect(toggle().textContent).toBe("+ Session settings");

    await user.click(toggle());

    expect(step().getAttribute("data-open")).toBe("true");
    expect(panel().hidden).toBe(false);
    expect(routeBox(/businesses/i)).toBeTruthy();
    noProfileField();
  });

  it("reads as closed while the step it unfolds in is folded, and open again with it", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());
    await connect(user);
    const chevron = () => toggle().querySelector(".fold-chevron")!;
    expect(step().getAttribute("data-open")).toBe("false");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(chevron().getAttribute("data-open")).toBe("false");

    await user.click(within(step()).getByRole("button", { name: /connect/i }));

    expect(step().getAttribute("data-open")).toBe("true");
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(chevron().getAttribute("data-open")).toBe("true");
    expect(panel().hidden).toBe(false);
  });

  it("closes the panel when it is pressed with the step open, and leaves the step open", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    await user.click(toggle());

    expect(step().getAttribute("data-open")).toBe("true");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(panel().hidden).toBe(true);
  });
});

describe("the panel: a plain click shows the public scope, a shift-click the match profile too", () => {
  it("opens, on a plain click, to the routes and the most rows, and never shows a match profile", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());

    expect(panel().hidden).toBe(false);
    for (const route of [/businesses/i, /people/i, /addresses/i]) {
      expect((routeBox(route) as HTMLInputElement).checked).toBe(false);
    }
    expect((rowsField() as HTMLInputElement).value).toBe("");
    noProfileField();
  });

  it("opens, on a shift-click, to the same fields and the match profile as well", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());

    expect(panel().hidden).toBe(false);
    expect(routeBox(/businesses/i)).toBeTruthy();
    expect(rowsField()).toBeTruthy();
    expect((profileSelect() as HTMLSelectElement).value).toBe("");
  });

  it("offers the routes in the API's order, and takes a number for the most rows", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    const boxes = within(panel()).getAllByRole("checkbox");

    expect(boxes.map(box => box.closest("label")?.textContent)).toEqual([
      "Businesses",
      "People",
      "Addresses",
    ]);
    expect(rowsField().getAttribute("min")).toBe("1");
    expect(rowsField().getAttribute("max")).toBe("20");
  });

  it("reveals the profile when Shift is held on the open panel, and leaves it open", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());
    noProfileField();

    await shiftClick(user, toggle());

    expect(panel().hidden).toBe(false);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(profileSelect()).toBeTruthy();
  });

  it("closes on a plain click, revealed or not", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());

    await user.click(toggle());

    expect(panel().hidden).toBe(true);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("keeps the profile revealed until the panel closes, and hides it when it is opened again plainly", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "standard");
    await user.click(
      within(panel()).getByRole("checkbox", { name: /people/i }),
    );
    // Still there while the panel stays open, whatever else is touched.
    expect(profileSelect()).toBeTruthy();

    await user.click(toggle());
    await user.click(toggle());

    expect(panel().hidden).toBe(false);
    noProfileField();
  });

  it("does not bring the profile back on a plain click at the folded step, after it was revealed and the panel closed", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());
    await user.click(toggle());
    expect(panel().hidden).toBe(true);
    await connect(user);
    expect(step().getAttribute("data-open")).toBe("false");

    await user.click(toggle());

    expect(step().getAttribute("data-open")).toBe("true");
    expect(panel().hidden).toBe(false);
    noProfileField();
  });

  it("is a shift-click that closes, when the profile is already revealed", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());

    await shiftClick(user, toggle());

    expect(panel().hidden).toBe(true);
  });

  it("opens the folded step with the profile revealed on a shift-click", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(step().getAttribute("data-open")).toBe("false");

    await shiftClick(user, toggle());

    expect(step().getAttribute("data-open")).toBe("true");
    expect(profileSelect()).toBeTruthy();
  });

  it("keeps a profile that was set while it is out of sight: the mint carries it and the toggle names it", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "max",
    );
    await user.click(toggle());

    await user.click(toggle());
    noProfileField();
    expect(toggle().textContent).toBe("Session · max");
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).toBe('{"scope":{"match_profile":"max"}}');
  });
});

describe("a mint with a scope set", () => {
  const ordered = (route: keyof typeof LEGAL_RELATIONS) => [
    ...LEGAL_RELATIONS[route],
  ];

  it("narrows to a route ticked, with every relation it carries, in Apply's own mint", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/people/i));
    await connect(user);

    expect(mints(api)).toHaveLength(1);
    expect(JSON.parse(bodyOf(mints(api)[0]!) as string)).toEqual({
      scope: { routes: { people: ordered("people") } },
    });
    expect(contentTypeOf(mints(api)[0]!)).toBe("application/json");
  });

  it("names several routes in the API's order, whichever was ticked first", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/addresses/i));
    await user.click(routeBox(/businesses/i));
    await connect(user);

    const body = JSON.parse(bodyOf(mints(api)[0]!) as string);
    expect(Object.keys(body.scope.routes)).toEqual(["businesses", "addresses"]);
  });

  it("asks for the most rows as max_limit", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.type(rowsField(), "5");
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).toBe('{"scope":{"max_limit":5}}');
  });

  it("keeps the most rows within 1 to 20, as the styling panel's Rows does", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    await user.type(rowsField(), "30");
    expect((rowsField() as HTMLInputElement).value).toBe("20");

    await user.clear(rowsField());
    await user.type(rowsField(), "0");
    expect((rowsField() as HTMLInputElement).value).toBe("1");

    fireEvent.change(rowsField(), { target: { value: "-3" } });
    expect((rowsField() as HTMLInputElement).value).toBe("1");
    fireEvent.change(rowsField(), { target: { value: "2.7" } });
    expect((rowsField() as HTMLInputElement).value).toBe("2");

    await user.clear(rowsField());
    expect((rowsField() as HTMLInputElement).value).toBe("");
  });

  it("sends the scope's fields and the profile in one body, only what is set", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.click(routeBox(/businesses/i));
    await user.type(rowsField(), "5");
    await user.selectOptions(profileSelect(), "reduced");
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).toBe(
      JSON.stringify({
        scope: {
          routes: { businesses: ordered("businesses") },
          max_limit: 5,
          match_profile: "reduced",
        },
      }),
    );
  });

  it("sends no match_profile from the plain panel, whatever else it sends", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/people/i));
    await user.type(rowsField(), "3");
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).not.toContain("match_profile");
    expect(bodyOf(mints(api)[0]!)).toContain("max_limit");
  });

  it("asks for the same scope in every later mint, the page's own client's", async () => {
    const api = stubApi({ grant: { expires_in: 8 } });
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/businesses/i));
    await user.type(rowsField(), "4");
    await connect(user);
    await user.type(nameField(), "cin");
    await waitFor(() => expect(mints(api)).toHaveLength(2));

    expect(bodyOf(mints(api)[1]!)).toBe(bodyOf(mints(api)[0]!));
    expect(JSON.parse(bodyOf(mints(api)[1]!) as string)).toEqual({
      scope: { routes: { businesses: ordered("businesses") }, max_limit: 4 },
    });
  });

  it("is no body at all again once what was ticked or typed is put back", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/people/i));
    await user.click(routeBox(/people/i));
    await user.type(rowsField(), "7");
    await user.clear(rowsField());
    expect(toggle().textContent).toBe("+ Session settings");
    await connect(user);

    expect("body" in mints(api)[0]![1]!).toBe(false);
    expect(contentTypeOf(mints(api)[0]!)).toBeNull();
  });

  it("takes another Apply when the scope changes after the key was applied", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);
    await connect(user);
    expect(screen.getByTestId("demo-apply").textContent).toBe("Applied");

    await user.click(toggle());
    await user.click(routeBox(/addresses/i));
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
    await user.click(screen.getByTestId("demo-apply"));
    await waitFor(() => expect(mints(api)).toHaveLength(2));

    expect("body" in mints(api)[0]![1]!).toBe(false);
    expect(JSON.parse(bodyOf(mints(api)[1]!) as string)).toEqual({
      scope: { routes: { addresses: ordered("addresses") } },
    });
    await user.click(routeBox(/addresses/i));
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
    await user.click(routeBox(/addresses/i));
    expect(screen.getByTestId("demo-apply").textContent).toBe("Applied");
  });

  it("shows the API's refusal in Apply's words, and leaves the key unapplied", async () => {
    stubApi({
      refuse: () =>
        reply(403, { code: 501, message: "That route is not yours to reach." }),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(routeBox(/people/i));
    await user.type(screen.getByTestId("demo-key"), "a-key");
    await user.click(screen.getByTestId("demo-apply"));

    expect(await screen.findByText(/HTTP 403/)).toBeTruthy();
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
  });
});

describe("the closed toggle, with a scope set", () => {
  it("names the routes, the most rows and the profile, as the filters name theirs", async () => {
    const user = userEvent.setup();
    render(<App />);
    await shiftClick(user, toggle());

    await user.click(routeBox(/businesses/i));
    expect(toggle().textContent).toBe("Session · businesses");
    await user.click(routeBox(/people/i));
    expect(toggle().textContent).toBe("Session · businesses, people");
    await user.type(rowsField(), "5");
    expect(toggle().textContent).toBe("Session · businesses, people · 5 rows");
    await user.selectOptions(profileSelect(), "reduced");
    expect(toggle().textContent).toBe(
      "Session · businesses, people · 5 rows · reduced",
    );
  });

  it("says 1 row, not 1 rows, and names nothing it is not set to", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    await user.type(rowsField(), "1");

    expect(toggle().textContent).toBe("Session · 1 row");
  });

  it("goes back to its first words when everything is put back", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(toggle());

    await user.click(routeBox(/addresses/i));
    await user.click(routeBox(/addresses/i));

    expect(toggle().textContent).toBe("+ Session settings");
  });
});

describe("a mint with no profile set, whether or not the fold was ever opened", () => {
  it("is the bodyless request it always was, Apply's and every later one", async () => {
    const api = stubApi({ grant: { expires_in: 8 } });
    const user = userEvent.setup();
    render(<App />);

    await connect(user);
    await user.type(nameField(), "cin");
    await waitFor(() => expect(mints(api)).toHaveLength(2));

    for (const call of mints(api)) {
      expect("body" in call[1]!).toBe(false);
      expect(contentTypeOf(call)).toBeNull();
    }
  });

  it("is that request after the fold was opened and closed without a choice", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await user.click(toggle());
    await user.click(toggle());
    await connect(user);

    expect("body" in mints(api)[0]![1]!).toBe(false);
    expect(contentTypeOf(mints(api)[0]!)).toBeNull();
  });

  it("is that request when custom was picked and nothing, or only spaces, typed", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "   ",
    );
    expect(toggle().textContent).toBe("+ Session settings");
    await connect(user);

    expect("body" in mints(api)[0]![1]!).toBe(false);
  });
});

describe("a mint with a profile set", () => {
  it.each(["standard", "reduced", "minimal"])(
    "asks for %s from the dropdown, in Apply's own mint",
    async profile => {
      const api = stubApi();
      const user = userEvent.setup();
      render(<App />);

      await shiftClick(user, toggle());
      await user.selectOptions(profileSelect(), profile);
      await connect(user);

      expect(mints(api)).toHaveLength(1);
      expect(bodyOf(mints(api)[0]!)).toBe(
        JSON.stringify({ scope: { match_profile: profile } }),
      );
      expect(contentTypeOf(mints(api)[0]!)).toBe("application/json");
    },
  );

  it("asks for a name typed in, as the one it knows", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "  max ",
    );
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).toBe('{"scope":{"match_profile":"max"}}');
    expect(contentTypeOf(mints(api)[0]!)).toBe("application/json");
  });

  it("asks for it in every later mint too, the page's own client's", async () => {
    const api = stubApi({ grant: { expires_in: 8 } });
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "reduced");
    await connect(user);
    await user.type(nameField(), "cin");
    await waitFor(() => expect(mints(api)).toHaveLength(2));

    for (const call of mints(api)) {
      expect(bodyOf(call)).toBe('{"scope":{"match_profile":"reduced"}}');
      expect(contentTypeOf(call)).toBe("application/json");
    }
  });

  it("still sends the key as the key, and only the key's header", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "minimal");
    await connect(user);

    const headers = new Headers(mints(api)[0]![1]!.headers);
    expect(headers.get("x-api-key")).toBe("a-key");
    expect(mints(api)[0]![1]!.method).toBe("POST");
    expect(mints(api)[0]![1]!.credentials).toBe("omit");
  });

  it("goes with the custom text only while custom is the choice", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "max",
    );
    await user.selectOptions(profileSelect(), "standard");
    await connect(user);

    expect(bodyOf(mints(api)[0]!)).toBe(
      '{"scope":{"match_profile":"standard"}}',
    );
  });

  it("keeps what was typed when the choice goes to custom again", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "max",
    );
    await user.selectOptions(profileSelect(), "standard");
    await user.selectOptions(profileSelect(), "custom");

    expect(
      (
        screen.getByRole("textbox", {
          name: /custom profile/i,
        }) as HTMLInputElement
      ).value,
    ).toBe("max");
  });

  it("shows the API's refusal in the words Apply uses, and leaves the key unapplied", async () => {
    stubApi({
      refuse: init =>
        init?.body === undefined
          ? undefined
          : reply(422, {
              code: 422,
              message: "Extra inputs are not permitted",
              metadata: null,
            }),
    });
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    await user.type(
      screen.getByRole("textbox", { name: /custom profile/i }),
      "nope",
    );
    await user.type(screen.getByTestId("demo-key"), "a-key");
    await user.click(screen.getByTestId("demo-apply"));

    await screen.findByText(/HTTP 422.*Extra inputs are not permitted/);
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
    expect(screen.queryByText(/key accepted/i)).toBeNull();
  });
});

describe("the closed row, once something is set", () => {
  it("names the value on its one line, as the filters name their count", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "minimal");
    await user.click(toggle());

    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    expect(toggle().textContent).toBe("Session · minimal");
  });

  it("names a typed value trimmed, and goes back to its first words when it is cleared", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "custom");
    const text = screen.getByRole("textbox", { name: /custom profile/i });
    await user.type(text, " max ");
    expect(toggle().textContent).toBe("Session · max");

    await user.clear(text);
    expect(toggle().textContent).toBe("+ Session settings");
  });

  it("goes back to its first words when the choice goes back to none", async () => {
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "reduced");
    await user.selectOptions(profileSelect(), "");

    expect(toggle().textContent).toBe("+ Session settings");
  });
});

describe("changing the profile after the key was applied", () => {
  it("takes another Apply, which mints once more with the new profile", async () => {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "standard");
    await connect(user);
    expect(screen.getByTestId("demo-apply").textContent).toBe("Applied");

    // The key step folded on Apply; open it again.
    await user.click(
      within(screen.getByTestId("demo-connect")).getAllByRole("button")[0]!,
    );
    await user.selectOptions(profileSelect(), "reduced");

    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");
    await user.click(screen.getByTestId("demo-apply"));
    await waitFor(() => expect(mints(api)).toHaveLength(2));

    expect(bodyOf(mints(api)[0]!)).toBe(
      '{"scope":{"match_profile":"standard"}}',
    );
    expect(bodyOf(mints(api)[1]!)).toBe(
      '{"scope":{"match_profile":"reduced"}}',
    );
  });

  it("is applied again when the profile is put back, and not before", async () => {
    stubApi();
    const user = userEvent.setup();
    render(<App />);

    await shiftClick(user, toggle());
    await user.selectOptions(profileSelect(), "standard");
    await connect(user);
    await user.click(
      within(screen.getByTestId("demo-connect")).getAllByRole("button")[0]!,
    );
    await user.selectOptions(profileSelect(), "reduced");
    expect(screen.getByTestId("demo-apply").textContent).toBe("Apply API key");

    await user.selectOptions(profileSelect(), "standard");

    expect(screen.getByTestId("demo-apply").textContent).toBe("Applied");
  });
});

describe("the Network panel", () => {
  async function minted(profile: string | null) {
    const api = stubApi();
    const user = userEvent.setup();
    render(<App />);
    if (profile !== null) {
      await shiftClick(user, toggle());
      await user.selectOptions(profileSelect(), profile);
    }
    await connect(user);
    await user.click(screen.getByTestId("demo-debug-open"));
    await user.click(screen.getByTestId("demo-debug-tab-network"));
    const log = await screen.findByTestId("demo-network");
    for (const row of log.querySelectorAll<HTMLElement>("button.net-row")) {
      await user.click(row);
    }
    return { api, log };
  }

  it("shows the mint's body, so what the page asked for is on screen", async () => {
    const { log } = await minted("minimal");

    expect(log.textContent).toContain("Request body");
    expect(log.textContent).toContain("match_profile");
    expect(log.textContent).toContain("minimal");
  });

  it("shows no request body for the mint of a page that set nothing", async () => {
    const { log } = await minted(null);

    expect(log.textContent).toMatch(/\b1 requests · 1 mint\b/);
    expect(log.textContent).not.toContain("Request body");
    expect(log.textContent).not.toContain("match_profile");
  });
});
