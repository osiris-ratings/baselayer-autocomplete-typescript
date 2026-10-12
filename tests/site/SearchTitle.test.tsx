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
  it("names the search, each other search a segment to switch to", () => {
    render(<Title />);

    expect(screen.getByRole("heading").getAttribute("aria-label")).toBe(
      "Autocomplete a business",
    );
    const tabs = screen.getByRole("tablist", { name: "Search by" });
    expect(
      screen.getAllByRole("tab", { hidden: false }).map(tab => tab.textContent),
    ).toEqual(["a business", "a person", "an address"]);
    // Each segment draws its noun, and has its article for a screen reader.
    expect(
      [...tabs.querySelectorAll(".search-by-noun")].map(
        noun => noun.textContent,
      ),
    ).toEqual(["business", "person", "address"]);
    expect(selected()).toEqual(["a business"]);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-controls")).toBe("panel");
    }
  });

  it("reads as a sentence whichever segment is selected, each with its own article", () => {
    render(<Title />);

    for (const [word, name] of [
      ["a business", "Autocomplete a business"],
      ["a person", "Autocomplete a person"],
      ["an address", "Autocomplete an address"],
    ] as const) {
      fireEvent.click(screen.getByRole("tab", { name: word }));

      expect(screen.getByRole("heading").getAttribute("aria-label")).toBe(name);
      expect(selected()).toEqual([word]);
    }
  });

  it("moves between the segments with the arrow keys, Home and End, focus with it", () => {
    render(<Title />);
    const tab = (name: string) => screen.getByRole("tab", { name });

    // Only the selected segment is in the tab order.
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

  it("offers a segment for each search the scope can allow, and none for a single search", () => {
    const sets: [readonly Route[], string][] = [
      [["businesses"], "Autocomplete a business"],
      [["people"], "Autocomplete a person"],
      [["addresses"], "Autocomplete an address"],
      [["businesses", "people"], "Autocomplete"],
      [["businesses", "addresses"], "Autocomplete"],
      [["people", "addresses"], "Autocomplete"],
      [["businesses", "people", "addresses"], "Autocomplete"],
    ];
    for (const [routes, lead] of sets) {
      const { unmount } = render(<Title routes={routes} start={routes[0]!} />);

      // A single search is named in the sentence; several are the segments,
      // after the word that leads them.
      expect(screen.getByRole("heading").textContent).toContain(`02${lead}`);
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
