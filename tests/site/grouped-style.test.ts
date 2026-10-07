import {
  ADDRESS_ROW,
  PERSON_ROW,
  resolveLayout,
} from "@baselayer-sdk/autocomplete";
import { describe, expect, it } from "vitest";

import {
  ADDRESS_EDITOR,
  DEFAULT_STYLE,
  EMPTY_PLACE,
  INITIAL_STYLE,
  PERSON_EDITOR,
  TRAY,
  editorOps,
  exportCode,
  type StyleState,
} from "../../site/demo/style-state";

const person = editorOps(PERSON_EDITOR);
const address = editorOps(ADDRESS_EDITOR);
const personDefault = resolveLayout(PERSON_ROW);
const addressDefault = resolveLayout(ADDRESS_ROW);

describe("the People and Addresses tabs' rows", () => {
  it("open on the SDK's default layouts, listing and picking businesses", () => {
    for (const state of [DEFAULT_STYLE, INITIAL_STYLE]) {
      expect(state.personLayout).toEqual(personDefault);
      expect(state.addressLayout).toEqual(addressDefault);
      expect(state.personInclude).toEqual(["businesses"]);
      expect(state.addressInclude).toEqual(["businesses"]);
      expect(state.personPickable).toEqual(["business"]);
      expect(state.addressPickable).toEqual(["business"]);
    }
  });

  it("offer a place only its own line's fields", () => {
    expect(
      person
        .placeOptions(personDefault, "headTrailing")
        .map(option => option.value),
    ).toEqual([EMPTY_PLACE, "firstAddress", "counts"]);
    expect(
      person
        .placeOptions(personDefault, "businessTrailing")
        .map(option => option.value),
    ).toEqual([EMPTY_PLACE, "address", "states", "role"]);
    expect(
      address
        .placeOptions(addressDefault, "personTrailing")
        .map(option => option.value),
    ).toEqual([EMPTY_PLACE, "personRole"]);
  });

  it("say which field a pick would swap, in the row's own words", () => {
    expect(
      person
        .placeOptions(personDefault, "businessTrailing")
        .find(option => option.value === "states")?.label,
    ).toBe("States, swaps with Beside business, right");
  });

  it("take a field only on its own line", () => {
    expect(person.canDrop(personDefault, "counts", "businessTrailing")).toBe(
      false,
    );
    expect(person.canDrop(personDefault, "role", "businessBadge")).toBe(true);
    expect(address.canDrop(addressDefault, "personRole", "headBadge")).toBe(
      false,
    );
  });

  it("swap within a line, and leave a field out on the tray", () => {
    const swapped = person.moveField(personDefault, "role", "businessBadge");
    expect(swapped.businessBadge).toBe("role");
    expect(swapped.businessTrailing).toBe("address");

    const out = person.moveField(personDefault, "firstAddress", TRAY);
    expect(out.headBadge).toBeNull();
    expect(person.unplacedFields(out)).toEqual(["firstAddress"]);
  });
});

describe("the exported configuration of a person or an address field", () => {
  it("names only the props a host must give while everything is the default", () => {
    expect(exportCode(DEFAULT_STYLE, "people").tsx).toBe(
      [
        "<PersonAutocomplete",
        '  id="person"',
        "  client={client}",
        "  value={value}",
        "  onChange={setValue}",
        "  onPick={pick => …}",
        "/>",
        "// Nothing else changed from the defaults.",
      ].join("\n"),
    );
    expect(exportCode(DEFAULT_STYLE, "addresses").tsx).toContain(
      '<AddressAutocomplete\n  id="address"\n',
    );
  });

  it("names the changed places, what is listed and what can be picked, with somewhere for a person or an address to go", () => {
    const state: StyleState = {
      ...DEFAULT_STYLE,
      personLayout: { ...personDefault, headBadge: null },
      personInclude: ["businesses", "addresses"],
      personPickable: ["business", "address"],
    };

    const { tsx } = exportCode(state, "people");

    expect(
      tsx.startsWith('<PersonAutocomplete\n  id="person"\n  client={client}\n'),
    ).toBe(true);
    expect(tsx.endsWith("\n/>")).toBe(true);
    expect(tsx).toContain("layout={{\n    headBadge: null,\n  }}");
    expect(tsx).toContain('include={["businesses", "addresses"]}');
    expect(tsx).toContain('pickable={["business", "address"]}');
    expect(tsx).toContain("onPickEntity={pick => …}");
  });

  it("keeps each field's export to its own row", () => {
    const state: StyleState = {
      ...DEFAULT_STYLE,
      personLayout: { ...personDefault, headBadge: null },
    };

    expect(exportCode(state, "businesses").tsx).not.toContain("headBadge");
    expect(exportCode(state, "addresses").tsx).not.toContain("headBadge");
    expect(exportCode(state).tsx).toBe(exportCode(state, "businesses").tsx);
  });
});
