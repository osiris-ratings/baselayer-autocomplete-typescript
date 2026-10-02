/** @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { SAMPLE_SUGGESTIONS } from "../../site/demo/sample";
import { SAMPLE_SEARCH } from "../../site/demo/sample-search";
import { SEARCH_WAIT_SECONDS } from "../../site/demo/searches";
import { SearchStep } from "../../site/demo/SearchStep";

// Step 03 as a visitor uses it: the Run button after a refusal, where focus
// goes when the report arrives, what a screen reader is told while the search
// is out, and the key a retry names its search by.

const suggestion = SAMPLE_SUGGESTIONS[0]!;

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>;

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** A fetch whose answer is given by hand, when the test chooses. */
function held() {
  let answer: (response: Response) => void = () => undefined;
  const fetchImpl = vi.fn<FetchImpl>(
    () =>
      new Promise<Response>(resolve => {
        answer = resolve;
      }),
  );
  return { fetchImpl, answer: (response: Response) => answer(response) };
}

/** A fetch that answers each call in turn: with a response, or by throwing. */
function scripted(...answers: (Response | Error)[]) {
  const queue = [...answers];
  return vi.fn<FetchImpl>(async () => {
    const next = queue.shift();
    if (next === undefined) throw new Error("no answer was queued");
    if (next instanceof Error) throw next;
    return next;
  });
}

/** The `Idempotency-Key` the nth call carried. */
function keyOf(fetchImpl: Mock<FetchImpl>, call: number): string | undefined {
  const init = fetchImpl.mock.calls[call]?.[1];
  return (init?.headers as Record<string, string> | undefined)?.[
    "Idempotency-Key"
  ];
}

function step(fetchImpl: FetchImpl) {
  return (
    <SearchStep
      apiKey="key"
      baseUrl="https://api.example.test"
      apiHost="https://api.example.test"
      picked={{
        suggestion,
        pick: {
          businessToken: "token",
          pickedAt: Date.now(),
          expiresAt: Date.now() + 10 * 60_000,
          matchedOn: [],
        },
      }}
      fetchImpl={fetchImpl}
      onShowDebug={() => undefined}
    />
  );
}

const runButton = () =>
  screen.getByTestId("demo-search-run") as HTMLButtonElement;

beforeEach(() => {
  // jsdom lays nothing out and has neither.
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("a pick the API refused", () => {
  it.each([
    [3042, "This pick expired"],
    [3040, "does not belong to this key's organization"],
    [3023, "no longer on file"],
  ])("cannot be run again: the API said %i", async (code, words) => {
    const fetchImpl = vi.fn<FetchImpl>(async () =>
      reply(422, { code, message: "m", uri: null, metadata: {} }),
    );
    render(step(fetchImpl));
    runButton().focus();
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(
      (await screen.findByTestId("demo-search-error")).textContent,
    ).toContain(words);
    // It no longer says the token is good, and Run does nothing more, yet
    // keeps focus (a disabled button would drop it to the page).
    const pick = screen.getByTestId("demo-search-pick").textContent;
    expect(pick).toContain("The API refused this pick.");
    expect(pick).not.toContain("is good for");
    expect(runButton().getAttribute("aria-disabled")).toBe("true");
    expect(document.activeElement).toBe(runButton());
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("is not the end of the step for any other failure", async () => {
    const fetchImpl = vi.fn<FetchImpl>(async () => reply(503, {}));
    render(step(fetchImpl));
    await act(async () => {
      fireEvent.click(runButton());
    });
    await screen.findByTestId("demo-search-error");
    expect(runButton().getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(runButton());
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("where focus goes when the report arrives", () => {
  it("is the report, when it was on Run", async () => {
    const { fetchImpl, answer } = held();
    render(step(fetchImpl));
    runButton().focus();
    await act(async () => {
      fireEvent.click(runButton());
    });
    await act(async () => {
      answer(reply(201, SAMPLE_SEARCH));
    });
    await screen.findByTestId("demo-search-result");
    expect(document.activeElement?.className).toContain("sr-title");
  });

  it("stays on the control the visitor moved to while the search was out", async () => {
    const { fetchImpl, answer } = held();
    render(
      <>
        <input data-testid="elsewhere" />
        {step(fetchImpl)}
      </>,
    );
    runButton().focus();
    await act(async () => {
      fireEvent.click(runButton());
    });
    const elsewhere = screen.getByTestId("elsewhere");
    elsewhere.focus();
    await act(async () => {
      answer(reply(201, SAMPLE_SEARCH));
    });
    await screen.findByTestId("demo-search-result");
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("what a screen reader is told", () => {
  it("is said once while the search is out, and never as the time ticks", async () => {
    vi.useFakeTimers();
    const { fetchImpl, answer } = held();
    const { container } = render(step(fetchImpl));
    // The step's own region, a paragraph (the report's copy button has one too).
    const live = () =>
      [...container.querySelectorAll('p[role="status"]')].map(
        node => node.textContent ?? "",
      );
    // Mounted before the run starts, and empty until there is something to say.
    expect(live()).toEqual([""]);
    await act(async () => {
      fireEvent.click(runButton());
    });
    const said = live();
    expect(said).toHaveLength(1);
    expect(said[0]).toContain("Searching");
    const ticking = container.querySelector(".sr-waiting");
    expect(ticking?.getAttribute("role")).toBeNull();
    const before = ticking?.textContent;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    // The visible counter moved, the live region did not.
    expect(container.querySelector(".sr-waiting")?.textContent).not.toBe(
      before,
    );
    expect(live()).toEqual(said);
    await act(async () => {
      answer(reply(201, SAMPLE_SEARCH));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(live()).toHaveLength(1);
    expect(live()[0]).toContain("Search finished");
  });

  it("is told what went wrong in the region that was already there", async () => {
    const fetchImpl = scripted(reply(503, {}));
    const { container } = render(step(fetchImpl));
    const live = () =>
      [...container.querySelectorAll('p[role="status"]')].map(
        node => node.textContent ?? "",
      );
    expect(live()).toEqual([""]);
    await act(async () => {
      fireEvent.click(runButton());
    });
    const callout = await screen.findByTestId("demo-search-error");
    // A region inserted with its words in it may not be read out; the callout
    // is the words on the page, and the one region says them.
    expect(callout.getAttribute("role")).toBeNull();
    expect(live()).toHaveLength(1);
    expect(live()[0]).toBe(callout.textContent);
    expect(live()[0]).toContain("could not run the search");
  });

  it("is told, while it waits, what follows the API's wait", async () => {
    const { fetchImpl } = held();
    const { container } = render(step(fetchImpl));
    await act(async () => {
      fireEvent.click(runButton());
    });
    // The call is held for 90 s at most, and the card stays up for longer
    // when the search takes longer: it must not claim the hold lasts.
    expect(container.querySelector(".sr-waiting")?.textContent).toContain(
      `holds the call for up to ${SEARCH_WAIT_SECONDS} s, then this page asks after the search`,
    );
  });
});

describe("the key a pick's search is named by", () => {
  const click = async () => {
    await act(async () => {
      fireEvent.click(runButton());
    });
  };

  // The API answers a call that carries a key it has seen with the search the
  // first call made. A call that failed may have made one, so its retry has
  // to carry the same key: a new key would make and bill a second search.
  it.each([
    ["an answer that never came", () => new TypeError("Failed to fetch")],
    ["a 5xx", () => reply(502, {})],
    ["a limit", () => reply(429, {})],
  ] as const)("is kept for a retry after %s", async (_what, failure) => {
    const fetchImpl = scripted(failure(), reply(201, SAMPLE_SEARCH));
    render(step(fetchImpl));
    await click();
    await screen.findByTestId("demo-search-error");
    await click();
    await screen.findByTestId("demo-search-result");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(keyOf(fetchImpl, 0)).toBeTruthy();
    expect(keyOf(fetchImpl, 1)).toBe(keyOf(fetchImpl, 0));
  });

  it("is kept through any number of failures", async () => {
    const fetchImpl = scripted(
      new TypeError("Failed to fetch"),
      reply(502, {}),
      reply(500, {}),
      reply(201, SAMPLE_SEARCH),
    );
    render(step(fetchImpl));
    for (let run = 0; run < 3; run++) {
      await click();
      await screen.findByTestId("demo-search-error");
    }
    await click();
    await screen.findByTestId("demo-search-result");
    const keys = [0, 1, 2, 3].map(call => keyOf(fetchImpl, call));
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBeTruthy();
  });

  // Running again once a search has come back is a new search on purpose.
  it.each([
    ["a report", SAMPLE_SEARCH],
    [
      "a search that found no business",
      { ...SAMPLE_SEARCH, state: "FAILED", error: "No match found." },
    ],
  ] as const)("is new for a search run again after %s", async (_what, body) => {
    const fetchImpl = scripted(reply(201, body), reply(201, body));
    render(step(fetchImpl));
    await click();
    await screen.findByTestId("demo-search-result");
    expect(runButton().textContent).toBe("Run again");
    await click();
    await screen.findByTestId("demo-search-result");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(keyOf(fetchImpl, 0)).toBeTruthy();
    expect(keyOf(fetchImpl, 1)).toBeTruthy();
    expect(keyOf(fetchImpl, 1)).not.toBe(keyOf(fetchImpl, 0));
  });

  it("is new for the failure after a report, and kept again from there", async () => {
    const fetchImpl = scripted(
      reply(201, SAMPLE_SEARCH),
      reply(502, {}),
      reply(201, SAMPLE_SEARCH),
    );
    render(step(fetchImpl));
    await click();
    await screen.findByTestId("demo-search-result");
    await click();
    await screen.findByTestId("demo-search-error");
    await click();
    await screen.findByTestId("demo-search-result");
    expect(keyOf(fetchImpl, 1)).not.toBe(keyOf(fetchImpl, 0));
    expect(keyOf(fetchImpl, 2)).toBe(keyOf(fetchImpl, 1));
  });
});
