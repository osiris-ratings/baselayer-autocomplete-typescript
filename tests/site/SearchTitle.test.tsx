// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { ROUTE_NAMES, type Route } from "@baselayer-sdk/autocomplete";

import { SearchTitle } from "../../site/demo/SearchTitle";

afterEach(cleanup);

/** The title with its search kept, as the demo keeps it. */
function Title({
  routes = ROUTE_NAMES,
  start = "businesses",
}: {
  routes?: readonly Route[];
  start?: Route;
}) {
  const [route, setRoute] = useState<Route>(start);
  return (
    <>
      <SearchTitle
        id="title"
        panelId="panel"
        routes={routes}
        route={route}
        onRoute={setRoute}
      />
      <div id="panel" />
    </>
  );
}

const selected = () =>
  screen
    .getAllByRole("tab")
    .filter(tab => tab.getAttribute("aria-selected") === "true")
    .map(tab => tab.textContent);

describe("the test form's title", () => {
  it("finishes its sentence with the search, each other search a word to switch to", () => {
    render(<Title />);

    expect(screen.getByRole("heading").getAttribute("aria-label")).toBe(
      "Autocomplete a business",
    );
    const tabs = screen.getByRole("tablist", { name: "Search by" });
    expect(
      screen.getAllByRole("tab", { hidden: false }).map(tab => tab.textContent),
    ).toEqual(["a business", "a person", "an address"]);
    expect(tabs.textContent).toBe("a business, a person, or an address");
    expect(selected()).toEqual(["a business"]);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-controls")).toBe("panel");
    }
  });

  it("reads as a sentence whichever word is selected, each with its own article", () => {
    render(<Title />);

    for (const [word, name] of [
      ["a business", "Autocomplete a business"],
      ["a person", "Autocomplete a person"],
      ["an address", "Autocomplete an address"],
    ] as const) {
      fireEvent.click(screen.getByRole("tab", { name: word }));

      expect(screen.getByRole("heading").textContent).toBe(
        "02Autocomplete a business, a person, or an address",
      );
      expect(screen.getByRole("heading").getAttribute("aria-label")).toBe(name);
      expect(selected()).toEqual([word]);
    }
  });

  it("moves between the words with the arrow keys, Home and End, focus with it", () => {
    render(<Title />);
    const tab = (name: string) => screen.getByRole("tab", { name });

    // Only the selected word is in the tab order.
    expect(
      screen.getAllByRole("tab").map(each => each.getAttribute("tabindex")),
    ).toEqual(["0", "-1", "-1"]);

    tab("a business").focus();
    fireEvent.keyDown(tab("a business"), { key: "ArrowRight" });
    expect(selected()).toEqual(["a person"]);
    expect(document.activeElement).toBe(tab("a person"));

    fireEvent.keyDown(tab("a person"), { key: "End" });
    expect(selected()).toEqual(["an address"]);
    fireEvent.keyDown(tab("an address"), { key: "ArrowRight" });
    expect(selected()).toEqual(["a business"]);
    fireEvent.keyDown(tab("a business"), { key: "ArrowLeft" });
    expect(selected()).toEqual(["an address"]);
    fireEvent.keyDown(tab("an address"), { key: "Home" });
    expect(selected()).toEqual(["a business"]);
    expect(document.activeElement).toBe(tab("a business"));
  });

  it("reads as a sentence for every set of searches the scope can allow", () => {
    const sentences: [readonly Route[], string][] = [
      [["businesses"], "Autocomplete a business"],
      [["people"], "Autocomplete a person"],
      [["addresses"], "Autocomplete an address"],
      [["businesses", "people"], "Autocomplete a business or a person"],
      [["businesses", "addresses"], "Autocomplete a business or an address"],
      [["people", "addresses"], "Autocomplete a person or an address"],
      [
        ["businesses", "people", "addresses"],
        "Autocomplete a business, a person, or an address",
      ],
    ];
    for (const [routes, sentence] of sentences) {
      const { unmount } = render(<Title routes={routes} start={routes[0]!} />);

      expect(screen.getByRole("heading").textContent).toBe(`02${sentence}`);
      // The commas and the "or" are the sentence's, never a tab's.
      expect(screen.queryAllByRole("tab").map(tab => tab.textContent)).toEqual(
        routes.length > 1
          ? routes.map(route =>
              route === "addresses"
                ? "an address"
                : route === "people"
                  ? "a person"
                  : "a business",
            )
          : [],
      );
      expect(screen.queryByRole("tablist") === null).toBe(routes.length === 1);
      unmount();
    }
  });
});
