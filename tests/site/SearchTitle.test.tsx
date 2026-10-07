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
    expect(tabs.textContent).toBe("business·person·address");
    expect(selected()).toEqual(["business"]);
    for (const tab of screen.getAllByRole("tab")) {
      expect(tab.getAttribute("aria-controls")).toBe("panel");
    }
  });

  it("takes the article its word needs", () => {
    render(<Title />);

    fireEvent.click(screen.getByRole("tab", { name: "address" }));

    expect(screen.getByRole("heading").getAttribute("aria-label")).toBe(
      "Autocomplete an address",
    );
    expect(screen.getByRole("heading").textContent).toContain(
      "Autocomplete an",
    );
    expect(selected()).toEqual(["address"]);
  });

  it("moves between the words with the arrow keys, Home and End, focus with it", () => {
    render(<Title />);
    const tab = (name: string) => screen.getByRole("tab", { name });

    // Only the selected word is in the tab order.
    expect(
      screen.getAllByRole("tab").map(each => each.getAttribute("tabindex")),
    ).toEqual(["0", "-1", "-1"]);

    tab("business").focus();
    fireEvent.keyDown(tab("business"), { key: "ArrowRight" });
    expect(selected()).toEqual(["person"]);
    expect(document.activeElement).toBe(tab("person"));

    fireEvent.keyDown(tab("person"), { key: "End" });
    expect(selected()).toEqual(["address"]);
    fireEvent.keyDown(tab("address"), { key: "ArrowRight" });
    expect(selected()).toEqual(["business"]);
    fireEvent.keyDown(tab("business"), { key: "ArrowLeft" });
    expect(selected()).toEqual(["address"]);
    fireEvent.keyDown(tab("address"), { key: "Home" });
    expect(selected()).toEqual(["business"]);
    expect(document.activeElement).toBe(tab("business"));
  });

  it("offers only the searches it is given, and no words at all for one", () => {
    const { unmount } = render(<Title routes={["businesses", "addresses"]} />);
    expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual([
      "business",
      "address",
    ]);
    unmount();

    render(<Title routes={["businesses"]} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.getByRole("heading").textContent).toBe(
      "02Autocomplete a business",
    );
  });
});
