import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { DEFAULT_LOOK, type BusinessSuggestion } from "@baselayer/autocomplete";

import {
  BusinessAutocompleteView,
  STATE_SQUARES,
  type BusinessAutocompleteViewProps,
} from "../../src/react";

const osiris: BusinessSuggestion = {
  type: "business",
  token: "tok-osiris-ratings",
  label: "OSIRIS RATINGS, INC.",
  matched_name: "BASELAYER",
  match: "strong",
  domicile_state: "DE",
  // Sorted, as the tier returns them; the domicile is not first here on purpose.
  states: ["CA", "DE", "FL", "IL", "MA", "MO", "NY"],
  related: {
    people: {
      count: 4,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "REGISTERED AGENT SOLUTIONS, INC",
          role: "agent",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Timothy Hyde",
          role: "officer",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "Ana Ray",
          role: "officer",
          matched: false,
        },
      ],
    },
    addresses: {
      count: 2,
      matched: null,
      truncated: false,
      // In the tier's order: nothing filed in Delaware, so the ladder runs
      // through the other states, own filings by role before the agent's.
      items: [
        {
          type: "address",
          token: "tok-7f1a2c3d",
          label: "600 W Main St, Jefferson City, MO 65101",
          role: "principal",
          matched: false,
        },
        {
          type: "address",
          token: "tok-6f1a2c3d",
          label: "29622 PO Box, Raleigh, NC 27626",
          role: "mailing",
          matched: false,
        },
        {
          type: "address",
          token: "tok-8f1a2c3d",
          label: "300 W Clarendon Ave, Phoenix, AZ 85013",
          role: "agent",
          matched: false,
        },
      ],
    },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
  highlight: [{ text: "OSIRIS", matched: true }],
};

const stable: BusinessSuggestion = {
  ...osiris,
  token: "tok-osiris-racing-stables",
  label: "OSIRIS RACING STABLES, LLC",
  matched_name: null,
  domicile_state: "FL",
  states: ["FL"],
  related: {
    people: { count: 0, matched: null, truncated: false, items: [] },
    addresses: { count: 0, matched: null, truncated: false, items: [] },
    liens: { count: null, matched: null, truncated: false, items: [] },
  },
};

/** The form's own label, as the console draws it. */
function hostLabel(labelProps: Record<string, unknown>) {
  // The `htmlFor` pairing it with the input arrives in the spread, which the
  // rule cannot see; "wires the host's label to the input" proves it.
  // eslint-disable-next-line jsx-a11y/label-has-associated-control
  return <label {...labelProps}>Legal Entity Name</label>;
}

function renderTypeahead(
  overrides: Partial<BusinessAutocompleteViewProps> = {},
) {
  const props: BusinessAutocompleteViewProps = {
    id: "businessName",
    value: "osir",
    onInputChange: vi.fn(),
    onSelect: vi.fn(),
    suggestions: [osiris, stable],
    found: 2,
    foundCapped: false,
    truncated: false,
    indexTag: "v9/202609140305",
    roundTripMs: 23,
    isSearching: false,
    error: null,
    look: { ...DEFAULT_LOOK, showDebugInfo: true },
    renderLabel: hostLabel,
    renderInput: inputProps => <input data-testid="name" {...inputProps} />,
    ...overrides,
  };
  const utils = render(<BusinessAutocompleteView {...props} />);
  // Typing is what opens a downshift combobox; the parent owns the value, so
  // the change reaches it through onInputChange rather than the DOM.
  fireEvent.change(utils.getByTestId("name"), { target: { value: "osiri" } });
  const root = utils.container.firstElementChild as HTMLElement;
  return { ...utils, props, root };
}

describe("BusinessAutocompleteView", () => {
  it("keeps the caret where a character was typed into the middle of the name", () => {
    // The form owns the value and hands it back on every keystroke. If that
    // round trip takes one render longer than downshift's own update, React
    // sees a controlled input whose DOM text is ahead of its prop, resets it,
    // and the caret lands at the end: a character typed into `OSI|RIS` reads
    // as typed at the end. So an owner exactly like the form's field.
    function Owner() {
      const [value, setValue] = useState("OSIRIS");
      return (
        <BusinessAutocompleteView
          id="businessName"
          value={value}
          onInputChange={setValue}
          onSelect={vi.fn()}
          suggestions={[]}
          found={0}
          foundCapped={false}
          truncated={false}
          indexTag={null}
          roundTripMs={null}
          isSearching={false}
          error={null}
          renderLabel={hostLabel}
          renderInput={inputProps => (
            <input data-testid="name" {...inputProps} />
          )}
        />
      );
    }
    render(<Owner />);
    const input = screen.getByTestId("name") as HTMLInputElement;

    // What the browser does for a keystroke at the caret: the text changes
    // under React's value tracker (the native setter, as fireEvent.change
    // uses), the caret sits after the typed character, then the event fires.
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(input, "OSIXRIS");
    input.setSelectionRange(4, 4);
    fireEvent.input(input);

    expect(input.value).toBe("OSIXRIS");
    expect(input.selectionStart).toBe(4);
  });

  it("reports typing to the parent and opens on it", () => {
    const { props } = renderTypeahead();

    expect(props.onInputChange).toHaveBeenCalledWith("osiri");
    expect(screen.getAllByTestId("business-suggestion")).toHaveLength(2);
  });

  it("puts the name and the alternative name that matched on the first line", () => {
    renderTypeahead();

    const [first] = screen.getAllByTestId("business-suggestion");
    expect(first).toHaveTextContent("OSIRIS RATINGS, INC.");
    expect(first).toHaveTextContent("also BASELAYER");
  });

  it("shows the domicile square first with its border, two more, then the overflow", () => {
    renderTypeahead();

    expect(STATE_SQUARES).toBe(3);
    const [first] = screen.getAllByTestId("business-suggestion");
    const squares = Array.from(
      first!.querySelectorAll('[data-testid="business-suggestion-state"]'),
    );
    expect(squares.map(node => node.textContent)).toEqual(["DE", "CA", "FL"]);
    // The border is the stylesheet's, keyed on this attribute.
    expect(squares[0]).toHaveAttribute("data-domicile", "true");
    expect(squares[1]).not.toHaveAttribute("data-domicile");
    expect(
      first!.querySelector('[data-testid="business-suggestion-more-states"]'),
    ).toHaveTextContent("+4");
  });

  it("omits the overflow when every state fits", () => {
    renderTypeahead();

    const [, second] = screen.getAllByTestId("business-suggestion");
    expect(
      second!.querySelectorAll('[data-testid="business-suggestion-state"]'),
    ).toHaveLength(1);
    expect(
      second!.querySelector('[data-testid="business-suggestion-more-states"]'),
    ).toBeNull();
  });

  it("puts the primary address and the officers on the second line", () => {
    renderTypeahead();

    const [first, second] = screen.getAllByTestId("business-suggestion");
    expect(
      first!.querySelector('[data-testid="business-suggestion-address"]'),
    ).toHaveTextContent("600 W Main St, Jefferson City, MO 65101");
    const officers = first!.querySelector(
      '[data-testid="business-suggestion-officers"]',
    );
    expect(officers).toHaveTextContent("Timothy Hyde +1");
    expect(officers).toHaveAttribute("data-role", "officer");
    expect(officers).not.toHaveTextContent("agent");
    expect(
      second!.querySelector('[data-testid="business-suggestion-address"]'),
    ).toHaveTextContent("No address on file");
    expect(
      second!.querySelector('[data-testid="business-suggestion-officers"]'),
    ).toBeNull();
  });

  it("counts the officers beyond the head in the +N, not just the head", () => {
    // Twelve officers on the family, three in the head (the tier's cap). The
    // head arithmetic alone said "+2"; the family says eleven more.
    const crowded: BusinessSuggestion = {
      ...osiris,
      token: "tok-crowded",
      related: {
        ...osiris.related,
        people: {
          count: 12,
          matched: null,
          truncated: true,
          items: [
            {
              type: "person",
              token: null,
              label: "Timothy Hyde",
              role: "officer",
              matched: false,
            },
            {
              type: "person",
              token: null,
              label: "Ana Ray",
              role: "officer",
              matched: false,
            },
            {
              type: "person",
              token: null,
              label: "Sam Lee",
              role: "officer",
              matched: false,
            },
          ],
        },
      },
    };
    renderTypeahead({ suggestions: [crowded], found: 1 });

    expect(
      screen.getByTestId("business-suggestion-officers"),
    ).toHaveTextContent("Timothy Hyde +11");
  });

  it("hands the picked suggestion to the parent", () => {
    const { props } = renderTypeahead();

    fireEvent.click(screen.getByText("OSIRIS RACING STABLES, LLC"));

    expect(props.onSelect).toHaveBeenCalledWith(stable);
  });

  it("does not commit a row the mouse merely rests on when the user tabs away", () => {
    // downshift commits the highlighted row on blur, and a mouse-move is what
    // highlights one. The menu overlaps the form, so a pointer parked on it
    // while the user tabs to the address field is ordinary, and it used to
    // overwrite the typed name and pin a token the user never chose. Only a
    // click or Enter is a pick.
    const { props } = renderTypeahead();
    const [, second] = screen.getAllByTestId("business-suggestion");
    fireEvent.mouseMove(second!);
    expect(second).toHaveAttribute("data-highlighted", "true");
    const addressField = document.createElement("input");
    document.body.appendChild(addressField);

    fireEvent.blur(screen.getByTestId("name"), { relatedTarget: addressField });

    expect(props.onSelect).not.toHaveBeenCalled();
    addressField.remove();
  });

  it("ends the list with the count, and the diagnostics when they are on", () => {
    renderTypeahead();

    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "2 matches",
    );
    expect(
      screen.getByTestId("business-suggestions-diagnostics"),
    ).toHaveTextContent("23 ms · v9/202609140305");
  });

  it("announces the count row, which is outside the listbox", () => {
    // The rows are the listbox's business; this row is deliberately outside it,
    // which left the count, "Searching…" and the only error surface the
    // typeahead has announced by nothing at all.
    renderTypeahead();

    const footer = screen.getByTestId("business-suggestions-footer");
    expect(footer).toHaveAttribute("role", "status");
    expect(footer).toHaveAttribute("aria-live", "polite");
  });

  it("only claims to be expanded when something is actually shown", () => {
    // downshift's `isOpen` drives `aria-expanded`, but the popover renders on
    // rows-or-count. Typing opens the menu before any reply arrives, so the
    // combobox announced an expanded listbox over an empty popover.
    const { getByTestId, queryByTestId } = renderTypeahead({
      suggestions: [],
      found: 0,
      isSearching: false,
      roundTripMs: null,
      error: null,
    });

    expect(
      queryByTestId("business-suggestions-footer"),
    ).not.toBeInTheDocument();
    expect(getByTestId("name")).toHaveAttribute("aria-expanded", "false");
  });

  it("claims to be expanded once there are rows to show", () => {
    renderTypeahead();

    expect(screen.getByTestId("name")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the count row out of the listbox, which holds only the options", () => {
    renderTypeahead();

    // `getMenuProps()` puts role="listbox" on the element the rows live in;
    // a footer inside it is invalid listbox content for assistive tech.
    const listbox = screen.getByRole("listbox");
    const [firstRow] = screen.getAllByTestId("business-suggestion");
    expect(listbox).toContainElement(firstRow!);
    expect(listbox).not.toContainElement(
      screen.getByTestId("business-suggestions-footer"),
    );
  });

  it("does not report a truncated answer as a count of zero", () => {
    // The bug this replaces: a query interrupted by the 700 ms budget before it
    // scored a single row came back `found: 0, found_capped: true`, and the
    // footer rendered "0+ matches", telling the caller a business that IS in
    // the index is not there. Cold pages make that the common case, not a rare
    // one, and the reply is an HTTP 200 so nothing else flags it.
    renderTypeahead({ suggestions: [], found: 0, truncated: true });

    const footer = screen.getByTestId("business-suggestions-footer");
    expect(footer).not.toHaveTextContent("0 matches");
    expect(footer).not.toHaveTextContent("0+ matches");
    expect(footer).toHaveTextContent(/still searching/i);
  });

  it("says a truncated answer with rows is partial rather than counting it", () => {
    renderTypeahead({ found: 2, truncated: true });

    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      /partial results/i,
    );
  });

  it("still counts a complete answer, including a real no-match", () => {
    // The flag must not swallow the honest cases: a finished search says how
    // many it found, and zero really means zero.
    renderTypeahead({ suggestions: [], found: 0, truncated: false });
    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "0 matches",
    );
  });

  it("says match, singular, for exactly one", () => {
    renderTypeahead({ suggestions: [stable], found: 1 });

    const footer = screen.getByTestId("business-suggestions-footer");
    expect(footer).toHaveTextContent("1 match");
    expect(footer).not.toHaveTextContent("1 matches");
  });

  it("marks a capped count as a floor and draws no diagnostics unless the override is on", () => {
    // `show_debug_info` defaults off, so this is what every caller sees until
    // a row turns it on, in production and everywhere else alike.
    renderTypeahead({
      look: DEFAULT_LOOK,
      found: 500,
      foundCapped: true,
    });

    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "500+ matches",
    );
    expect(
      screen.queryByTestId("business-suggestions-diagnostics"),
    ).not.toBeInTheDocument();
  });

  it("puts the error in the count row and no rows in the list", () => {
    renderTypeahead({
      suggestions: [],
      found: 0,
      error: "Autocomplete unavailable (HTTP 503)",
    });

    expect(screen.queryAllByTestId("business-suggestion")).toHaveLength(0);
    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "Autocomplete unavailable (HTTP 503)",
    );
  });

  it("says it is searching until the first rows arrive", () => {
    renderTypeahead({
      suggestions: [],
      found: 0,
      roundTripMs: null,
      isSearching: true,
    });

    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "Searching…",
    );
  });
});

// Ported from the console's AutocompleteMenu shell, which the SDK folds into
// the view: the same `data-testid` and `data-open`, hidden rather than unmounted.
describe("the menu", () => {
  function heldOpen(overrides: Partial<BusinessAutocompleteViewProps> = {}) {
    return render(
      <BusinessAutocompleteView
        id="businessName"
        value=""
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
        suggestions={[osiris, stable]}
        found={2}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={23}
        isSearching={false}
        error={null}
        open
        {...overrides}
      />,
    );
  }

  it("shows its rows when held open, before any focus or typing", () => {
    heldOpen();

    expect(screen.getByTestId("autocomplete-menu")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getAllByTestId("business-suggestion")).toHaveLength(2);
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(screen.getByRole("status")).toHaveTextContent("2 matches");
  });

  it("stays open through a blur and Escape while held open", () => {
    heldOpen();
    const input = screen.getByRole("combobox");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "osiri" } });
    fireEvent.blur(input);
    fireEvent.keyDown(input, { key: "Escape" });

    expect(screen.getByTestId("autocomplete-menu")).toHaveAttribute(
      "data-open",
      "true",
    );
    expect(screen.getAllByTestId("business-suggestion")).toHaveLength(2);
  });

  it("still shows nothing when held open with nothing to show", () => {
    heldOpen({ suggestions: [], found: 0, roundTripMs: null });

    expect(screen.getByTestId("autocomplete-menu")).toHaveAttribute(
      "data-open",
      "false",
    );
    expect(screen.getByRole("combobox")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("closes as usual once it is no longer held open", () => {
    const { rerender } = heldOpen();
    rerender(
      <BusinessAutocompleteView
        id="businessName"
        value=""
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
        suggestions={[osiris, stable]}
        found={2}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={23}
        isSearching={false}
        error={null}
      />,
    );

    expect(screen.getByTestId("autocomplete-menu")).toHaveAttribute(
      "data-open",
      "false",
    );
  });

  it("keeps its contents mounted whether open or closed, and says which it is", () => {
    const { rerender } = render(
      <BusinessAutocompleteView
        id="businessName"
        value="osir"
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
        suggestions={[osiris]}
        found={1}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={23}
        isSearching={false}
        error={null}
      />,
    );

    // Downshift needs its menu element in the DOM while closed.
    const listbox = screen.getByRole("listbox", { hidden: true });
    const menu = screen.getByTestId("autocomplete-menu");
    expect(menu).toHaveAttribute("data-open", "false");
    expect(menu).not.toBeVisible();
    expect(screen.queryAllByTestId("business-suggestion")).toHaveLength(0);

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "osiri" },
    });

    expect(menu).toHaveAttribute("data-open", "true");
    expect(menu).toBeVisible();
    // The same element, not a remount.
    expect(screen.getByRole("listbox")).toBe(listbox);
    expect(screen.getAllByTestId("business-suggestion")).toHaveLength(1);

    rerender(
      <BusinessAutocompleteView
        id="businessName"
        value="osiri"
        onInputChange={vi.fn()}
        onSelect={vi.fn()}
        suggestions={[]}
        found={0}
        foundCapped={false}
        truncated={false}
        indexTag={null}
        roundTripMs={null}
        isSearching={false}
        error={null}
      />,
    );

    // Open as far as downshift is concerned, but with nothing to draw.
    expect(menu).toHaveAttribute("data-open", "false");
    expect(screen.getByRole("listbox", { hidden: true })).toBe(listbox);
  });
});

// The readers of a suggestion (`leadAddressOf`, `peopleLineOf`, ...) are pure
// and tested with the core; here only what the component makes of them.
const agentsOnly: BusinessSuggestion = {
  ...osiris,
  token: "tok-shell-holdings",
  label: "SHELL HOLDINGS LLC",
  related: {
    ...osiris.related,
    people: {
      count: 2,
      matched: null,
      truncated: false,
      items: [
        {
          type: "person",
          token: null,
          label: "REGISTERED AGENT SOLUTIONS, INC",
          role: "agent",
          matched: false,
        },
        {
          type: "person",
          token: null,
          label: "C T CORPORATION SYSTEM",
          role: "agent",
          matched: false,
        },
      ],
    },
  },
};

// The tier splits the name it matched into parts and marks the words a typed
// token starts; concatenated, the parts spell that name. Here `osir` was typed.
const stableMarked: BusinessSuggestion = {
  ...stable,
  highlight: [
    { text: "OSIRIS", matched: true },
    { text: " RACING STABLES, LLC", matched: false },
  ],
};

// The alternative name is what matched, so the parts spell it, not the label.
const osirisAltMarked: BusinessSuggestion = {
  ...osiris,
  highlight: [{ text: "BASELAYER", matched: true }],
};

function marksOf(row: HTMLElement | undefined): (string | null)[] {
  return Array.from(
    row?.querySelectorAll('[data-testid="business-suggestion-match"]') ?? [],
  ).map(node => node.textContent);
}

describe("the match marks", () => {
  it("marks the words the typed tokens start and keeps the name whole, underlined by default", () => {
    const { root } = renderTypeahead({ suggestions: [stableMarked], found: 1 });

    const [row] = screen.getAllByTestId("business-suggestion");
    const name = screen.getByTestId("business-suggestion-name");
    expect(name).toHaveTextContent("OSIRIS RACING STABLES, LLC");
    expect(name).toHaveAttribute("data-emphasis", "underline");
    expect(root).toHaveAttribute("data-emphasis", "underline");
    expect(marksOf(row)).toEqual(["OSIRIS"]);
    // The underline is the stylesheet's, keyed on the mark's class.
    expect(screen.getByTestId("business-suggestion-match")).toHaveClass(
      "bl-ac-mark",
    );
  });

  it("marks the alternative name when that is what matched, and leaves the label alone", () => {
    renderTypeahead({ suggestions: [osirisAltMarked], found: 1 });

    const [row] = screen.getAllByTestId("business-suggestion");
    expect(marksOf(row)).toEqual(["BASELAYER"]);
    const [mark] = row!.querySelectorAll(
      '[data-testid="business-suggestion-match"]',
    );
    expect(
      mark!.closest('[data-testid="business-suggestion-also"]'),
    ).not.toBeNull();
    const name = screen.getByTestId("business-suggestion-name");
    expect(name).toHaveTextContent("OSIRIS RATINGS, INC.");
    expect(name).toHaveTextContent("also BASELAYER");
  });

  it("marks nothing on a row the query reached some other way", () => {
    // An officer or an address matched: the tier sends no parts. And parts
    // that spell neither name belong to nothing on the row, so they are not
    // drawn either: the name is shown as it is rather than half-marked.
    const unmarked: BusinessSuggestion = { ...stable, highlight: [] };
    renderTypeahead({ suggestions: [unmarked, osiris], found: 2 });

    const [first, second] = screen.getAllByTestId("business-suggestion");
    expect(marksOf(first)).toEqual([]);
    expect(first).toHaveTextContent("OSIRIS RACING STABLES, LLC");
    expect(marksOf(second)).toEqual([]);
    expect(second).toHaveTextContent("OSIRIS RATINGS, INC.");
    expect(second).toHaveTextContent("also BASELAYER");
  });

  it("draws no marks under the plain emphasis", () => {
    const { root } = renderTypeahead({
      suggestions: [stableMarked],
      found: 1,
      look: { ...DEFAULT_LOOK, matchEmphasis: "plain" },
    });

    const [row] = screen.getAllByTestId("business-suggestion");
    expect(marksOf(row)).toEqual([]);
    expect(screen.getByTestId("business-suggestion-name")).toHaveAttribute(
      "data-emphasis",
      "plain",
    );
    expect(root).toHaveAttribute("data-emphasis", "plain");
  });

  it("marks only the typed characters under the substring region", () => {
    // `osir` is the value in the field; the tier marked the whole word.
    const { root } = renderTypeahead({
      suggestions: [stableMarked],
      found: 1,
      look: { ...DEFAULT_LOOK, matchEmphasisRegion: "substring" },
    });

    const [row] = screen.getAllByTestId("business-suggestion");
    expect(marksOf(row)).toEqual(["OSIR"]);
    const name = screen.getByTestId("business-suggestion-name");
    expect(name).toHaveTextContent("OSIRIS RACING STABLES, LLC");
    expect(name).toHaveAttribute("data-region", "substring");
    expect(root).toHaveAttribute("data-region", "substring");
  });

  it("marks every typed word of a two-word match, whichever region", () => {
    // `howard concrete`: the tier bridges the two matched words into one part.
    const howard: BusinessSuggestion = {
      ...stable,
      token: "tok-howard",
      label: "HOWARD CONCRETE PUMPING CO., INC.",
      highlight: [
        { text: "HOWARD CONCRETE", matched: true },
        { text: " PUMPING CO., INC.", matched: false },
      ],
    };
    const { unmount } = renderTypeahead({
      suggestions: [howard],
      found: 1,
      value: "how conc",
      look: { ...DEFAULT_LOOK, matchEmphasisRegion: "substring" },
    });
    expect(marksOf(screen.getByTestId("business-suggestion"))).toEqual([
      "HOW",
      "CONC",
    ]);
    unmount();

    renderTypeahead({ suggestions: [howard], found: 1, value: "how conc" });
    expect(marksOf(screen.getByTestId("business-suggestion"))).toEqual([
      "HOWARD CONCRETE",
    ]);
  });

  it("paints the background highlight in the look's own color", () => {
    // The console asserted Chakra's computed style; the SDK hands the color to
    // its stylesheet as a variable on the root, and says a color is staged.
    const { root } = renderTypeahead({
      suggestions: [stableMarked],
      found: 1,
      look: {
        ...DEFAULT_LOOK,
        matchEmphasis: "background",
        matchEmphasisColor: "#fef08a",
      },
    });

    const [mark] = screen.getAllByTestId("business-suggestion-match");
    expect(mark).toHaveTextContent("OSIRIS");
    expect(mark).toHaveClass("bl-ac-mark");
    expect(screen.getByTestId("business-suggestion-name")).toHaveAttribute(
      "data-emphasis",
      "background",
    );
    expect(root).toHaveAttribute("data-emphasis", "background");
    expect(root).toHaveAttribute("data-mark-color", "true");
    expect(root.style.getPropertyValue("--bl-ac-mark")).toBe("#fef08a");
  });

  it("leaves the mark color to the treatment when the look stages none", () => {
    const { root } = renderTypeahead({
      suggestions: [stableMarked],
      found: 1,
      look: { matchEmphasis: "background" },
    });

    expect(root).toHaveAttribute("data-emphasis", "background");
    expect(root).not.toHaveAttribute("data-mark-color");
    expect(root.style.getPropertyValue("--bl-ac-mark")).toBe("");
  });

  it("paints the menu, the lines and the squares in the look's colors", () => {
    // The console asserted each element's computed Chakra style; the SDK sets
    // one variable per color on the root, which its classes read.
    const { root } = renderTypeahead({
      suggestions: [osiris],
      found: 1,
      look: {
        ...DEFAULT_LOOK,
        backgroundColor: "#0b1a2b",
        titleColor: "#f7fafc",
        subtitleColor: "#a0aec0",
        pillBackgroundColor: "#1c4532",
        pillForegroundColor: "#c6f6d5",
        primaryPillBorderColor: "#68d391",
        secondaryPillBackgroundColor: "#2d3748",
      },
    });

    expect(root).toHaveClass("bl-ac");
    const variable = (name: string) => root.style.getPropertyValue(name);
    expect(variable("--bl-ac-bg")).toBe("#0b1a2b");
    expect(variable("--bl-ac-title")).toBe("#f7fafc");
    expect(variable("--bl-ac-subtitle")).toBe("#a0aec0");
    expect(variable("--bl-ac-pill-bg")).toBe("#1c4532");
    expect(variable("--bl-ac-pill-fg")).toBe("#c6f6d5");
    expect(variable("--bl-ac-pill-primary-border")).toBe("#68d391");
    expect(variable("--bl-ac-pill-secondary-bg")).toBe("#2d3748");
    // And the elements carry the classes that read them.
    expect(screen.getByTestId("autocomplete-menu")).toHaveClass("bl-ac-menu");
    expect(screen.getByTestId("business-suggestion-name")).toHaveClass(
      "bl-ac-name",
    );
    expect(screen.getByTestId("business-suggestion-also")).toHaveClass(
      "bl-ac-also",
    );
    const [domicile, other] = screen.getAllByTestId(
      "business-suggestion-state",
    );
    expect(domicile).toHaveClass("bl-ac-state");
    expect(domicile).toHaveAttribute("data-domicile", "true");
    expect(other).toHaveClass("bl-ac-state");
    expect(screen.getByTestId("business-suggestion-more-states")).toHaveClass(
      "bl-ac-more-states",
    );
  });

  it("sets a variable only for a color that differs from the default", () => {
    const { root } = renderTypeahead({
      look: {
        titleColor: "#f7fafc",
        backgroundColor: DEFAULT_LOOK.backgroundColor,
        // Not a hex color: it keeps the default, and sets nothing.
        subtitleColor: "gray.500",
      },
    });

    expect(root.style.getPropertyValue("--bl-ac-title")).toBe("#f7fafc");
    expect(root.style.getPropertyValue("--bl-ac-bg")).toBe("");
    expect(root.style.getPropertyValue("--bl-ac-subtitle")).toBe("");
    expect(root.style.getPropertyValue("--bl-ac-pill-bg")).toBe("");
  });

  it("sets no variables at all for the default look", () => {
    const { root } = renderTypeahead({ look: DEFAULT_LOOK });

    expect(root.getAttribute("style") ?? "").toBe("");
    expect(root).toHaveAttribute("data-emphasis", "underline");
    expect(root).toHaveAttribute("data-region", "token");
  });

  it.each(["weight", "ink", "underline", "background"] as const)(
    "draws the marks under the %s emphasis it is given",
    emphasis => {
      const { root } = renderTypeahead({
        suggestions: [stableMarked],
        found: 1,
        look: { ...DEFAULT_LOOK, matchEmphasis: emphasis },
      });

      const [row] = screen.getAllByTestId("business-suggestion");
      expect(marksOf(row)).toEqual(["OSIRIS"]);
      expect(screen.getByTestId("business-suggestion-name")).toHaveAttribute(
        "data-emphasis",
        emphasis,
      );
      expect(root).toHaveAttribute("data-emphasis", emphasis);
    },
  );
});

describe("the people line", () => {
  it("marks a registered agent on the row so it is not read as a person", () => {
    renderTypeahead({ suggestions: [agentsOnly], found: 1 });

    const line = screen.getByTestId("business-suggestion-officers");
    expect(line).toHaveTextContent(
      "REGISTERED AGENT SOLUTIONS, INC +1 · agent",
    );
    expect(line).toHaveAttribute("data-role", "agent");
  });
});

function baseProps(
  overrides: Partial<BusinessAutocompleteViewProps> = {},
): BusinessAutocompleteViewProps {
  return {
    id: "businessName",
    value: "osir",
    onInputChange: vi.fn(),
    onSelect: vi.fn(),
    suggestions: [osiris, stable],
    found: 2,
    foundCapped: false,
    truncated: false,
    indexTag: null,
    roundTripMs: 23,
    isSearching: false,
    error: null,
    ...overrides,
  };
}

function openDefault(props: BusinessAutocompleteViewProps) {
  const utils = render(<BusinessAutocompleteView {...props} />);
  fireEvent.change(screen.getByRole("combobox"), {
    target: { value: "osiri" },
  });
  return utils;
}

describe("the default label and input", () => {
  it("draws a plain input, and a label only when one is given", () => {
    const { unmount } = openDefault(baseProps());

    const input = screen.getByRole("combobox");
    expect(input.tagName).toBe("INPUT");
    expect(input).toHaveClass("bl-ac-input");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(document.querySelector("label")).toBeNull();
    unmount();

    openDefault(baseProps({ label: "Business name", inputName: "legalName" }));
    // The listbox is labeled by it too, as downshift wires it.
    const labeled = screen.getByLabelText("Business name", {
      selector: "input",
    });
    expect(labeled).toBe(screen.getByRole("combobox"));
    expect(screen.getByRole("listbox")).toHaveAccessibleName("Business name");
    expect(labeled).toHaveAttribute("name", "legalName");
    expect(screen.getByText("Business name")).toHaveClass("bl-ac-label");
  });

  it("wires the host's label to the input", () => {
    renderTypeahead();

    expect(
      screen.getByLabelText("Legal Entity Name", { selector: "input" }),
    ).toBe(screen.getByTestId("name"));
  });

  it("hands the host's ref, focus and blur to the input", () => {
    const inputRef = { current: null as HTMLInputElement | null };
    const onInputFocus = vi.fn();
    const onInputBlur = vi.fn();
    render(
      <BusinessAutocompleteView
        {...baseProps({ inputRef, onInputFocus, onInputBlur })}
      />,
    );

    const input = screen.getByRole("combobox");
    expect(inputRef.current).toBe(input);
    fireEvent.focus(input);
    expect(onInputFocus).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onInputBlur).toHaveBeenCalledTimes(1);
  });
});

describe("the host's classes", () => {
  it("adds a host class to its slot beside the stylesheet's", () => {
    const { container } = openDefault(
      baseProps({
        label: "Business name",
        classNames: {
          root: "host-root",
          input: "host-input",
          label: "host-label",
          menu: "host-menu",
          row: "host-row",
          name: "host-name",
          state: "host-state",
          footer: "host-footer",
        },
      }),
    );

    expect(container.firstElementChild).toHaveClass("bl-ac", "host-root");
    expect(screen.getByRole("combobox")).toHaveClass(
      "bl-ac-input",
      "host-input",
    );
    expect(screen.getByText("Business name")).toHaveClass(
      "bl-ac-label",
      "host-label",
    );
    expect(screen.getByTestId("autocomplete-menu")).toHaveClass(
      "bl-ac-menu",
      "host-menu",
    );
    for (const row of screen.getAllByTestId("business-suggestion")) {
      expect(row).toHaveClass("bl-ac-row", "host-row");
    }
    for (const name of screen.getAllByTestId("business-suggestion-name")) {
      expect(name).toHaveClass("bl-ac-name", "host-name");
    }
    for (const state of screen.getAllByTestId("business-suggestion-state")) {
      expect(state).toHaveClass("bl-ac-state", "host-state");
    }
    expect(screen.getByTestId("business-suggestions-footer")).toHaveClass(
      "bl-ac-footer",
      "host-footer",
    );
  });

  it("emits no bl-ac classes when unstyled, and keeps every data attribute", () => {
    const { container } = openDefault(
      baseProps({
        unstyled: true,
        suggestions: [stableMarked, osiris],
        look: { matchEmphasis: "background", matchEmphasisColor: "#fef08a" },
      }),
    );

    const styled = Array.from(container.querySelectorAll("[class]")).filter(
      node => /(^|\s)bl-ac/.test(node.getAttribute("class") ?? ""),
    );
    expect(styled).toEqual([]);
    expect(screen.getByRole("combobox")).not.toHaveAttribute("class");

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveAttribute("data-emphasis", "background");
    expect(root).toHaveAttribute("data-mark-color", "true");
    expect(root.style.getPropertyValue("--bl-ac-mark")).toBe("#fef08a");
    expect(screen.getByTestId("autocomplete-menu")).toHaveAttribute(
      "data-open",
      "true",
    );
    const [marked, other] = screen.getAllByTestId("business-suggestion");
    expect(marksOf(marked)).toEqual(["OSIRIS"]);
    expect(
      screen.getAllByTestId("business-suggestion-name")[0],
    ).toHaveAttribute("data-emphasis", "background");
    expect(
      other!.querySelector('[data-testid="business-suggestion-state"]'),
    ).toHaveAttribute("data-domicile", "true");
    expect(
      other!.querySelector('[data-testid="business-suggestion-officers"]'),
    ).toHaveAttribute("data-role", "officer");
    expect(screen.getByTestId("business-suggestions-footer")).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("keeps only the host's classes when unstyled", () => {
    openDefault(
      baseProps({
        unstyled: true,
        classNames: { row: "host-row", input: "host-input" },
      }),
    );

    expect(screen.getByRole("combobox")).toHaveAttribute("class", "host-input");
    for (const row of screen.getAllByTestId("business-suggestion")) {
      expect(row).toHaveAttribute("class", "host-row");
    }
  });
});

describe("renderRow", () => {
  it("hands the host the default row to wrap, and the row stays an option", () => {
    const renderRow = vi.fn<
      NonNullable<BusinessAutocompleteViewProps["renderRow"]>
    >(({ index, highlighted, defaultRow }) => (
      <div data-testid="wrapped" data-index={index} data-lit={highlighted}>
        {defaultRow}
      </div>
    ));
    const onSelect = vi.fn();
    openDefault(baseProps({ renderRow, onSelect }));

    const wrapped = screen.getAllByTestId("wrapped");
    expect(wrapped).toHaveLength(2);
    expect(wrapped[0]).toHaveTextContent("OSIRIS RATINGS, INC.");
    expect(
      wrapped[0]!.querySelector('[data-testid="business-suggestion-state"]'),
    ).toHaveTextContent("DE");
    expect(renderRow).toHaveBeenCalledWith(
      expect.objectContaining({ item: osiris, index: 0, highlighted: false }),
    );
    const [, second] = screen.getAllByRole("option");
    expect(second).toContainElement(wrapped[1]!);

    fireEvent.mouseMove(second!);
    expect(renderRow).toHaveBeenLastCalledWith(
      expect.objectContaining({ item: stable, index: 1, highlighted: true }),
    );
    fireEvent.click(second!);
    expect(onSelect).toHaveBeenCalledWith(stable);
  });

  it("lets the host replace the row outright", () => {
    openDefault(
      baseProps({ renderRow: ({ item }) => <strong>{item.label}</strong> }),
    );

    const rows = screen.getAllByTestId("business-suggestion");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("OSIRIS RATINGS, INC.");
    expect(
      screen.queryByTestId("business-suggestion-state"),
    ).not.toBeInTheDocument();
  });
});

describe("messages", () => {
  it("draws the host's words over the defaults, one at a time", () => {
    openDefault(
      baseProps({
        messages: {
          noAddress: "Address unknown",
          matches: "businesses",
          more: count => `and ${count} more`,
          agentSuffix: " (agent)",
        },
        suggestions: [osiris, stable, agentsOnly],
        found: 3,
      }),
    );

    const [first, second, third] = screen.getAllByTestId("business-suggestion");
    expect(
      second!.querySelector('[data-testid="business-suggestion-address"]'),
    ).toHaveTextContent("Address unknown");
    expect(
      first!.querySelector('[data-testid="business-suggestion-more-states"]'),
    ).toHaveTextContent("and 4 more");
    expect(
      first!.querySelector('[data-testid="business-suggestion-officers"]'),
    ).toHaveTextContent("Timothy Hyde and 1 more");
    expect(
      third!.querySelector('[data-testid="business-suggestion-officers"]'),
    ).toHaveTextContent("REGISTERED AGENT SOLUTIONS, INC and 1 more (agent)");
    expect(screen.getByTestId("business-suggestions-footer")).toHaveTextContent(
      "3 businesses",
    );
  });

  it("uses the host's words for the singular, searching and truncated rows", () => {
    const messages = {
      match: "business",
      searching: "Looking…",
      truncatedNoRows: "Keep typing",
      truncatedRows: "Partial list",
    };
    const { rerender } = openDefault(
      baseProps({ messages, suggestions: [stable], found: 1 }),
    );
    const footer = () => screen.getByTestId("business-suggestions-footer");
    expect(footer()).toHaveTextContent("1 business");

    rerender(
      <BusinessAutocompleteView
        {...baseProps({
          messages,
          suggestions: [],
          found: 0,
          roundTripMs: null,
          isSearching: true,
        })}
      />,
    );
    expect(footer()).toHaveTextContent("Looking…");

    rerender(
      <BusinessAutocompleteView
        {...baseProps({
          messages,
          suggestions: [],
          found: 0,
          truncated: true,
        })}
      />,
    );
    expect(footer()).toHaveTextContent("Keep typing");

    rerender(
      <BusinessAutocompleteView
        {...baseProps({ messages, truncated: true })}
      />,
    );
    expect(footer()).toHaveTextContent("Partial list");
  });
});

describe("the row's parts", () => {
  function rowOf(parts: BusinessAutocompleteViewProps["parts"]) {
    renderTypeahead(parts === undefined ? {} : { parts });
    return screen.getAllByTestId("business-suggestion")[0]!;
  }
  const within = (row: HTMLElement, id: string) =>
    row.querySelectorAll(`[data-testid="${id}"]`).length;

  it("shows the title, the flags, the subtitle and the secondary subtitle by default", () => {
    const row = rowOf(undefined);

    expect(within(row, "business-suggestion-name")).toBe(1);
    expect(within(row, "business-suggestion-state")).toBeGreaterThan(0);
    expect(within(row, "business-suggestion-address")).toBe(1);
    expect(within(row, "business-suggestion-officers")).toBe(1);
  });

  it.each([
    ["flags", "business-suggestion-state"],
    ["subtitle", "business-suggestion-address"],
    ["secondarySubtitle", "business-suggestion-officers"],
  ] as const)(
    "leaves out the %s when told to, and nothing else",
    (part, id) => {
      const row = rowOf({ [part]: false });

      expect(within(row, id)).toBe(0);
      const others = [
        "business-suggestion-name",
        "business-suggestion-address",
        "business-suggestion-officers",
      ].filter(other => other !== id);
      for (const other of others) {
        expect(within(row, other)).toBe(1);
      }
    },
  );

  it("always shows the title: a row is the entity it names", () => {
    const row = rowOf({
      flags: false,
      subtitle: false,
      secondarySubtitle: false,
    });

    expect(within(row, "business-suggestion-name")).toBe(1);
    expect(row.querySelectorAll(".bl-ac-line")).toHaveLength(1);
  });

  /** Each line of a row, as the test ids of what it holds, in order. */
  function lines(row: HTMLElement): string[][] {
    return [...row.querySelectorAll(".bl-ac-line")].map(line =>
      [
        ...line.querySelectorAll(
          ":scope > [data-testid], :scope > .bl-ac-states",
        ),
      ].map(part => part.getAttribute("data-testid") ?? "flags"),
    );
  }

  it("keeps the two lines as ever with every part shown", () => {
    expect(lines(rowOf(undefined))).toEqual([
      ["business-suggestion-name", "flags"],
      ["business-suggestion-address", "business-suggestion-officers"],
    ]);
  });

  it.each([
    // Without the subtitle, the officers are promoted to subtitle.
    [
      { subtitle: false },
      [["business-suggestion-name", "flags"], ["business-suggestion-officers"]],
    ],
    [
      { flags: false, subtitle: false },
      [["business-suggestion-name"], ["business-suggestion-officers"]],
    ],
    // Without the flags, every other part keeps its place.
    [
      { flags: false },
      [
        ["business-suggestion-name"],
        ["business-suggestion-address", "business-suggestion-officers"],
      ],
    ],
    // Without both subtitles, the title's line is the row.
    [
      { subtitle: false, secondarySubtitle: false },
      [["business-suggestion-name", "flags"]],
    ],
  ])("places what %j leaves, so no line starts with a gap", (parts, drawn) => {
    expect(lines(rowOf(parts))).toEqual(drawn);
  });

  it("leaves a row with no officers to promote at its title line", () => {
    renderTypeahead({ parts: { subtitle: false } });
    const [first, second] = screen.getAllByTestId("business-suggestion");

    expect(first!.querySelectorAll(".bl-ac-line")).toHaveLength(2);
    // The second row has no officers: nothing is promoted, and no empty line
    // is drawn where they would have been.
    expect(second!.querySelectorAll(".bl-ac-line")).toHaveLength(1);
    expect(second!.querySelector(".bl-ac-states")).toHaveAttribute(
      "data-slot",
      "right",
    );
  });
});
